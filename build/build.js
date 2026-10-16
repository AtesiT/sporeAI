#!/usr/bin/env node
/* Assembles the single-file game from its authored parts.
   Usage:  node build/build.js            -> writes index.html at repo root
   The parts exist only to keep authoring and syntax-checking tractable; the
   shipped artefact is one self-contained index.html with no dependencies. */
const fs = require('fs');
const path = require('path');

const BUILD = __dirname;
const ROOT = path.resolve(BUILD, '..');

const HEAD = '00_head.html';
const TAIL = '99_tail.html';
const PARTS = [
  '01_core.js',      // config + math/RNG utilities
  '02_stages.js',    // the evolution graph (30+ nodes)
  '03_specs.js',     // bestiary + depth zones
  '04_sound.js',     // WebAudio synthesis
  '05_vis_a.js',     // procedural body archetypes
  '06_vis_b.js',     // vertebrate body, layers, sprite cache
  '07_world_entities.js', // chunked infinite world + entities
  '08_player.js',    // player genome, FX, camera
  '09_render.js',    // renderer
  '10_ui.js',        // DOM UI
  '11_game.js',      // state machine, loop, input, boot
];

function build() {
  const head = fs.readFileSync(path.join(BUILD, HEAD), 'utf8');
  const tail = fs.readFileSync(path.join(BUILD, TAIL), 'utf8');
  const js = PARTS.map(f => {
    const src = fs.readFileSync(path.join(BUILD, f), 'utf8');
    return '\n/* ==== ' + f + ' ' + '='.repeat(Math.max(0, 62 - f.length)) + ' */\n' + src;
  }).join('\n');

  // sanity: a stray </script> inside JS would break the document
  if (/<\/script/i.test(js)) throw new Error('JS parts contain a </script> sequence');

  const out = head + js + '\n' + tail;
  const dest = path.join(ROOT, 'index.html');
  fs.writeFileSync(dest, out);

  // syntax-check the concatenated JS on its own
  const check = path.join(BUILD, '_bundle_check.js');
  fs.writeFileSync(check, js);
  try {
    new (require('vm').Script)(js, { filename: 'bundle.js' });
  } catch (e) {
    console.error('BUNDLE SYNTAX ERROR:', e.message);
    process.exit(1);
  }
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  const lines = out.split('\n').length;
  console.log(`built ${path.relative(ROOT, dest)}  ·  ${kb} KB  ·  ${lines} lines  ·  ${PARTS.length} parts`);
}

build();
