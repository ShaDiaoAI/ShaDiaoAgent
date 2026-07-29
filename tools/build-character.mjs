#!/usr/bin/env node
/**
 * 沙雕人物资源构建脚本
 *
 * 三步合一：
 *   1. 死代码清理 — 移除 AN 发布产物中未使用的符号/雪碧图/manifest
 *   2. 图片内嵌 — 把 images/ 中的 PNG 转为 base64 data URI 嵌入 JS
 *   3. 帧循环注入 — 注入 JavaScript 侧的动画循环/瞬态回位逻辑
 *
 * 用法：
 *   node build-character.mjs <发布目录> [--name <项目名>] [--output <输出文件>]
 *
 * 示例：
 *   node build-character.mjs workspace-files/v1王朝/虾仁1
 *   node build-character.mjs workspace-files/v1王朝/虾仁1 --name xiaren1h5 --output resources/characters/xiaren1h5/xiaren1h5.bundle.js
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { minify } from 'terser';

// ====== 配置 ======
const CONFIG = {
  pngquantQuality: '65-80',
};

// ====== 工具函数 ======

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileToDataUri(filePath) {
  const buffer = readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const ext = extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${base64}`;
}

/** 在目录中查找 Animate 发布的 JS 文件 */
function findAnimateJs(directory) {
  for (const f of readdirSync(directory).sort()) {
    if (!f.endsWith('.js')) continue;
    const path = join(directory, f);
    try {
      const head = readFileSync(path, 'utf-8').slice(0, 512);
      if (head.includes('cjs') && head.includes('an')) {
        const head2 = readFileSync(path, 'utf-8').slice(0, 16384);
        if (head2.includes('lib.ssMetadata')) return f;
      }
    } catch { continue; }
  }
  return null;
}

/** 查找配套 HTML 文件 */
function findHtml(directory, jsName) {
  const basename = jsName.replace(/\.js$/, '');
  const htmlPath = join(directory, basename + '.html');
  if (existsSync(htmlPath)) return basename + '.html';
  for (const f of readdirSync(directory).sort()) {
    if (!f.endsWith('.html')) continue;
    if (readFileSync(join(directory, f), 'utf-8').includes(jsName)) return f;
  }
  return null;
}

// ====== 主构建流程 ======

async function buildCharacter(targetDir, options = {}) {
  const { projectName, outputPath } = options;

  // ====== 步骤 0: 自动检测文件 ======
  let jsFile, htmlFile;
  if (projectName) {
    jsFile = projectName + '.js';
    htmlFile = projectName + '.html';
    if (!existsSync(join(targetDir, jsFile))) {
      console.error(`❌ 找不到 ${join(targetDir, jsFile)}`);
      process.exit(1);
    }
  } else {
    jsFile = findAnimateJs(targetDir);
    if (!jsFile) {
      console.error(`❌ 在 ${targetDir} 中找不到 Animate 发布的 JS 文件`);
      process.exit(1);
    }
    htmlFile = findHtml(targetDir, jsFile);
    console.log(`🔍 自动检测: JS=${jsFile}, HTML=${htmlFile || '无'}`);
  }

  const jsPath = join(targetDir, jsFile);
  const htmlPath = htmlFile ? join(targetDir, htmlFile) : null;
  const imagesDir = join(targetDir, 'images');
  const charName = jsFile.replace(/\.js$/, '');

  let jsText = readFileSync(jsPath, 'utf-8');
  const jsLines = jsText.split('\n');
  const origJsSize = Buffer.byteLength(jsText, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 构建角色: ${charName}`);
  console.log(`   原始 JS: ${humanSize(origJsSize)}`);

  // ====== 步骤 1: 分析符号使用情况 ======
  console.log(`\n🔍 步骤 1/7: 分析符号使用情况...`);

  // 所有被实例化的符号 (new lib.xxx)
  const instantiated = new Set();
  for (const m of jsText.matchAll(/new lib\.([A-Za-z_0-9一-鿿㐀-䶿豈-﫿]+)/g)) {
    instantiated.add(m[1]);
  }
  // 也从 HTML 中找
  if (htmlPath && existsSync(htmlPath)) {
    const htmlText = readFileSync(htmlPath, 'utf-8');
    for (const m of htmlText.matchAll(/new lib\.([A-Za-z_0-9一-鿿㐀-䶿豈-﫿]+)/g)) {
      instantiated.add(m[1]);
    }
  }
  console.log(`   被实例化的符号: ${instantiated.size}`);

  // 所有定义的符号及其行范围
  const symbolDefs = {};
  const pattern = /\(lib\.([A-Za-z_0-9一-鿿㐀-䶿豈-﫿]+) = function/g;
  for (const m of jsText.matchAll(pattern)) {
    const name = m[1];
    const startPos = m.index;
    const startLine = jsText.slice(0, startPos).split('\n').length - 1; // 0-indexed

    // 找到这个符号定义的结束位置（下一个 prototype 或者空行之后）
    const rest = jsText.slice(startPos);
    const protoMatch = rest.match(/\.prototype = p = new cjs\.\w+\(\);?/);
    if (!protoMatch) continue;

    const endPos = startPos + protoMatch.index + protoMatch[0].length;
    let endLine = jsText.slice(0, endPos).split('\n').length - 1;

    // 跳过结尾空行
    while (endLine + 1 < jsLines.length && jsLines[endLine + 1].trim() === '') {
      endLine++;
    }

    // 跳过 p.nominalBounds = ... 行（它紧跟在 prototype = p = new 之后，属于当前符号）
    // 如果不同步删除，死代码清理后会留下孤儿 nominalBounds 行，试图在 undefined 上设属性
    while (endLine + 1 < jsLines.length && /^\s*p\.nominalBounds\s*=/.test(jsLines[endLine + 1])) {
      endLine++;
    }

    // 分析引用哪个 ss
    const segment = jsText.slice(startPos, endPos + 100);
    let refsSS = false;
    let ssName = null;
    const ssMatch = segment.match(/ss\["([^"]+)"\]/);
    if (ssMatch) {
      refsSS = true;
      ssName = ssMatch[1];
    }

    symbolDefs[name] = { start: startLine, end: endLine, refsSS, ssName };
  }

  // 反向索引：每个 ss 被哪些符号引用
  const ssUsedBy = {};
  for (const [name, info] of Object.entries(symbolDefs)) {
    if (info.ssName) {
      if (!ssUsedBy[info.ssName]) ssUsedBy[info.ssName] = new Set();
      ssUsedBy[info.ssName].add(name);
    }
  }

  // 判断 ss 是否被使用
  const usedSS = new Set();
  const wastedSS = new Set();
  for (const [sn, syms] of Object.entries(ssUsedBy)) {
    if ([...syms].some(s => instantiated.has(s))) {
      usedSS.add(sn);
    } else {
      wastedSS.add(sn);
    }
  }

  console.log(`   定义的符号: ${Object.keys(symbolDefs).length}`);
  console.log(`   使用的雪碧图: ${usedSS.size}`);
  console.log(`   浪费的雪碧图: ${wastedSS.size}`);

  // 决定移除哪些符号（未实例化 + 引用未使用 ss 的）
  const symbolsToRemove = new Set();
  const unusedSymbols = Object.keys(symbolDefs).filter(s => !instantiated.has(s));

  for (const name of unusedSymbols) {
    const info = symbolDefs[name];
    if (info.ssName && wastedSS.has(info.ssName)) {
      symbolsToRemove.add(name);
    } else if (!info.refsSS) {
      symbolsToRemove.add(name);
    } else if (name.includes('CachedTexturedBitmap')) {
      symbolsToRemove.add(name);
    }
  }

  console.log(`   移除死符号: ${symbolsToRemove.size}`);

  // ====== 步骤 2: 移除死符号定义 ======
  console.log(`\n🔧 步骤 2/7: 移除死符号...`);

  const linesToRemove = new Set();
  for (const name of symbolsToRemove) {
    if (symbolDefs[name]) {
      for (let i = symbolDefs[name].start; i <= symbolDefs[name].end; i++) {
        linesToRemove.add(i);
      }
    }
  }

  const newJsLines = jsLines.filter((_, i) => !linesToRemove.has(i));
  let newJs = newJsLines.join('\n');
  const afterDeadCodeSize = Buffer.byteLength(newJs, 'utf-8');
  console.log(`   JS: ${humanSize(origJsSize)} → ${humanSize(afterDeadCodeSize)} (节省 ${((1 - afterDeadCodeSize / origJsSize) * 100).toFixed(0)}%)`);

  // ====== 步骤 3: 更新 ssMetadata ======
  console.log(`\n🔧 步骤 3/7: 更新 ssMetadata...`);

  const ssMetaMatch = newJs.match(/(lib\.ssMetadata = \[)(.*?)(\];)/s);
  if (ssMetaMatch) {
    const keepEntries = [];
    const removedEntries = [];
    for (const entryMatch of ssMetaMatch[2].matchAll(/\{name:"[^"]+", frames: \[.*?\]\}/g)) {
      const fullEntry = entryMatch[0];
      const nameMatch = fullEntry.match(/name:"([^"]+)"/);
      if (nameMatch) {
        if (usedSS.has(nameMatch[1])) {
          keepEntries.push(fullEntry);
        } else {
          removedEntries.push(nameMatch[1]);
        }
      }
    }
    const newSSMeta = keepEntries.join(',\n\t\t');
    newJs = newJs.slice(0, ssMetaMatch.index + ssMetaMatch[1].length) + newSSMeta + '\n];' + newJs.slice(ssMetaMatch.index + ssMetaMatch[1].length + ssMetaMatch[2].length + ssMetaMatch[3].length);
    console.log(`   ssMetadata: → ${keepEntries.length} (移除 ${removedEntries.length})`);
  }

  // ====== 步骤 4: 更新 manifest + 内嵌图片 ======
  console.log(`\n🔧 步骤 4/7: 内嵌图片...`);

  const manifestMatch = newJs.match(/(manifest:\s*\[)(.*?)(\])/s);
  let imagesEmbedded = 0;
  let totalImageOrigSize = 0;

  if (manifestMatch) {
    const entries = [...manifestMatch[2].matchAll(/\{src:"[^"]+",\s*id:"[^"]+"\}/g)];
    const keepEntries = [];
    const manifestRemoveIds = [];

    for (const entryMatch of entries) {
      const entry = entryMatch[0];
      const idMatch = entry.match(/id:"([^"]+)"/);
      if (!idMatch) continue;
      const eid = idMatch[1];

      // 检查是否需要保留
      const keep = usedSS.has(eid) || instantiated.has(eid);
      if (!keep) {
        manifestRemoveIds.push(eid);
        continue;
      }

      // 尝试内嵌图片
      const srcMatch = entry.match(/src:"([^"]+)"/);
      if (srcMatch && existsSync(imagesDir)) {
        const srcPath = srcMatch[1]; // e.g., "images/xiaren1h5_atlas_1.png"
        const imgName = basename(srcPath);
        const fullImgPath = join(imagesDir, imgName);

        if (existsSync(fullImgPath)) {
          const origSize = statSync(fullImgPath).size;
          totalImageOrigSize += origSize;
          const dataUri = fileToDataUri(fullImgPath);
          const newEntry = `{src:"${dataUri}", id:"${eid}", type:"image"}`;
          keepEntries.push(newEntry);
          imagesEmbedded++;
        } else {
          keepEntries.push(entry);
        }
      } else {
        keepEntries.push(entry);
      }
    }

    const newManifest = keepEntries.join(',\n\t\t');
    newJs = newJs.slice(0, manifestMatch.index + manifestMatch[1].length) + newManifest + '\n]' + newJs.slice(manifestMatch.index + manifestMatch[1].length + manifestMatch[2].length + manifestMatch[3].length);
    console.log(`   manifest: → ${keepEntries.length} (移除 ${manifestRemoveIds.length} + 内嵌 ${imagesEmbedded})`);
    if (totalImageOrigSize > 0) {
      console.log(`   图片原始大小: ${humanSize(totalImageOrigSize)}`);
    }
  }

  // ====== 步骤 5: 注入帧边界循环检测 ======
  console.log(`\n🔧 步骤 5/7: 注入帧边界循环检测...`);

  // 自动检测主类名 + 提取 frame labels
  // 可能有多个类匹配此模式，真正的主类是帧标签最多的那个（通常有 6-7 个）
  const mainClassCandidates = [...newJs.matchAll(/\(lib\.([A-Za-z_0-9一-鿿]+) = function\(mode,startPosition,loop\)\s*\{\s*\n\s*this\.initialize\(mode,startPosition,loop,(\{[^}]*\})/g)];
  let mainClassName = null;
  let labelsStr = null;
  if (mainClassCandidates.length > 0) {
    let best = mainClassCandidates[0];
    let bestLabelCount = 0;
    for (const m of mainClassCandidates) {
      const labelCount = (m[2].match(/"?\s*(\w+)"?\s*:\s*(\d+)/g) || []).length;
      if (labelCount > bestLabelCount) {
        bestLabelCount = labelCount;
        best = m;
      }
    }
    mainClassName = best[1];
    labelsStr = best[2];
  }

  if (mainClassName && labelsStr) {
    // 解析 labels 对象: {idle:0,thinking:299,...} 或 {" idle":0,...}
    // AN 导出中带空格的标签会用引号包起来（如 " idle"），需保留原始文本做映射
    const labelMap = {};      // clean → frame
    const rawLabelMap = {};   // clean → raw (仅当 raw 有空白字符时)
    for (const m of labelsStr.matchAll(/"([^"]+)"\s*:\s*(\d+)|(\w+)\s*:\s*(\d+)/g)) {
      let raw, clean, frame;
      if (m[1] !== undefined) {
        raw = m[1]; clean = raw.trim(); frame = parseInt(m[2]);
      } else {
        raw = m[3]; clean = raw; frame = parseInt(m[4]);
      }
      labelMap[clean] = frame;
      if (raw !== clean) rawLabelMap[clean] = raw;
    }
    const sortedLabels = Object.entries(labelMap).sort((a, b) => a[1] - b[1]);

    if (sortedLabels.length === 0) {
      console.log(`   ⚠️  主类 ${mainClassName} 无帧标签 (labels={})，跳过注入`);
    } else {
      console.log(`   检测到 ${sortedLabels.length} 个帧标签: ${sortedLabels.map(([k,v]) => `${k}:${v}`).join(', ')}`);
      if (Object.keys(rawLabelMap).length > 0) {
        console.log(`   ⚠️  检测到带空白字符的标签，生成映射: ${JSON.stringify(rawLabelMap)}`);
      }

      // 计算每段结束帧
      const segmentEnds = {};
      const totalFrames = sortedLabels[sortedLabels.length - 1][1] + 60; // 最后一段 + 60 帧 buffer
      for (let i = 0; i < sortedLabels.length; i++) {
        const name = sortedLabels[i][0];
        segmentEnds[name] = (i + 1 < sortedLabels.length) ? sortedLabels[i + 1][1] - 1 : totalFrames - 1;
      }

      // 循环态 vs 瞬态
      const loopingSet = new Set(['idle', 'thinking', 'streaming', 'tool_calling']);

      // 生成 JS 注入代码
      const labelsJson = JSON.stringify(labelMap);
      const rawLabelsJson = JSON.stringify(rawLabelMap);
      const segmentEndsJson = JSON.stringify(segmentEnds);
      const loopingArrJson = JSON.stringify([...loopingSet]);

      const helperCode = `
// ====== 注入: 帧边界循环检测 ======
if (lib.${mainClassName}) {
  (function() {
    var _labels = ${labelsJson};
    var _rawLabels = ${rawLabelsJson};
    var _segmentEnd = ${segmentEndsJson};
    var _looping = new Set(${loopingArrJson});
    var _origGotoAndPlay = lib.${mainClassName}.prototype.gotoAndPlay;

    // 覆盖 gotoAndPlay，记录当前标签
    lib.${mainClassName}.prototype.gotoAndPlay = function(label) {
      if (_labels.hasOwnProperty(label)) {
        this.__label = label;
        this.__endFrame = _segmentEnd[label];
        this.__looping = _looping.has(label);
      }
      // AN 导出中标签可能带空白字符（如 " idle"），映射回原始标签名
      _origGotoAndPlay.call(this, _rawLabels[label] || label);
    };

    // 每帧调用：检查是否到达段尾，自动循环/归位
    lib.${mainClassName}.prototype.tickLoopCheck = function() {
      if (this.__label == null) return;
      if (this.currentFrame >= this.__endFrame) {
        if (this.__looping) {
          this.gotoAndPlay(this.__label);
        } else {
          this.gotoAndPlay('idle');
        }
      }
    };
  })();
}
`;
      const mainClassInjectionPoint = newJs.indexOf("// library properties:");
      if (mainClassInjectionPoint > 0) {
        newJs = newJs.slice(0, mainClassInjectionPoint) + helperCode + '\n' + newJs.slice(mainClassInjectionPoint);
        console.log(`   ✅ 帧边界检测已注入 (类: ${mainClassName})`);
      } else {
        console.log(`   ⚠️  找不到注入点，跳过`);
      }
    }
  } else {
    console.log(`   ⚠️  无法检测主类名或 labels，跳过注入`);
  }

  // ====== 清理多余空行 ======
  newJs = newJs.replace(/\n{4,}/g, '\n\n\n');

  // ====== 步骤 6: JS 压缩 (terser) ======
  console.log(`\n🔧 步骤 6/7: JS 压缩...`);

  const preMinifySize = Buffer.byteLength(newJs, 'utf-8');
  const minResult = await minify(newJs, {
    compress: {
      drop_console: false,
      keep_fnames: true,
    },
    mangle: {
      keep_fnames: true,
    },
    format: {
      comments: false,
    },
  });

  if (minResult.code) {
    const postMinifySize = Buffer.byteLength(minResult.code, 'utf-8');
    newJs = minResult.code;
    const saved = preMinifySize - postMinifySize;
    const pct = ((saved / preMinifySize) * 100).toFixed(0);
    console.log(`   压缩前: ${humanSize(preMinifySize)}`);
    console.log(`   压缩后: ${humanSize(postMinifySize)}`);
    console.log(`   节省:   ${humanSize(saved)} (${pct}%)`);
  } else {
    console.log(`   ⚠️  压缩失败，跳过`);
  }

  // ====== 步骤 7: 输出 ======
  console.log(`\n💾 步骤 7/7: 写入输出...`);

  const finalJsSize = Buffer.byteLength(newJs, 'utf-8');

  let outputDir, outJsPath;
  if (outputPath) {
    outputDir = dirname(outputPath);
    outJsPath = outputPath;
  } else {
    outputDir = join(targetDir, 'output');
    outJsPath = join(outputDir, charName + '.bundle.js');
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(outJsPath, newJs, 'utf-8');

  // 复制 createjs 运行时到输出目录
  const createjsOut = join(outputDir, 'createjs.min.js');
  if (!existsSync(createjsOut)) {
    const existingCreatejs = join(targetDir, 'output', 'createjs.min.js');
    if (existsSync(existingCreatejs)) {
      copyFileSync(existingCreatejs, createjsOut);
      console.log(`   📄 createjs.min.js (复制)`);
    }
  }

  // ====== 统计报告 ======
  const pctChange = ((finalJsSize / origJsSize - 1) * 100).toFixed(0);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 构建结果: ${charName}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   原始 JS:      ${humanSize(origJsSize)}`);
  console.log(`   移除死代码:   ${humanSize(origJsSize - afterDeadCodeSize)}`);
  console.log(`   图片内嵌:     ${humanSize(totalImageOrigSize)} (${imagesEmbedded} 张 → base64)`);
  console.log(`   最终 JS:      ${humanSize(finalJsSize)} (${Number(pctChange) >= 0 ? '+' : ''}${pctChange}%)`);
  console.log(`   输出:         ${outJsPath}`);
}

// ====== CLI ======
function main() {
  const args = process.argv.slice(2);

  let targetDir = null;
  let projectName = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' || args[i] === '-n') {
      projectName = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (!targetDir) {
      targetDir = args[i];
    }
  }

  if (!targetDir) {
    console.error('用法: node build-character.mjs <发布目录> [--name <项目名>] [--output <输出文件>]');
    console.error('示例: node build-character.mjs workspace-files/v1王朝/虾仁1');
    process.exit(1);
  }

  targetDir = targetDir.startsWith('/') ? targetDir : join(process.cwd(), targetDir);
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    console.error(`❌ 目录不存在: ${targetDir}`);
    process.exit(1);
  }

  buildCharacter(targetDir, { projectName, outputPath }).catch(e => {
    console.error('构建失败:', e);
    process.exit(1);
  });
}

main();
