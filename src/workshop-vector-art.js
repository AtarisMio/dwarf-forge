import { svgText } from './vector-panels.js';

// Editable vector artwork. No external images or font requests are required.
// WebGL samples a high-density rendering of these paths; the SVG remains the
// source of truth, rather than enlarging a small bitmap.
const n = value => Number(value.toFixed(2));
function generator(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function art(width, height, body) { return { width, height, body }; }

function stoneArt() {
  const rand = generator(49271), paths = ['<rect width="1024" height="1024" fill="#858781"/>'];
  for (let i = 0; i < 75; i++) {
    const x = n(rand() * 1024), y = n(rand() * 1024), rx = n(25 + rand() * 110), ry = n(22 + rand() * 95);
    paths.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${i % 3 ? '#444c46' : '#c6b99b'}" opacity=".055"/>`);
  }
  for (let i = 0; i < 3000; i++) {
    paths.push(`<circle cx="${n(rand() * 1024)}" cy="${n(rand() * 1024)}" r="${n(.35 + rand() * 1.6)}" fill="${i % 3 ? '#30372f' : '#ddd1b4'}" opacity="${n(.09 + rand() * .13)}"/>`);
  }
  for (let i = 0; i < 28; i++) {
    let x = rand() * 1024, y = rand() * 1024, d = `M${n(x)} ${n(y)}`;
    for (let j = 0; j < 5; j++) { x += rand() * 45 - 22; y += rand() * 55; d += `l${n(rand() * 45 - 22)} ${n(rand() * 55)}`; }
    paths.push(`<path d="${d}" fill="none" stroke="#303932" stroke-width=".9" opacity=".18"/>`);
  }
  return art(1024, 1024, paths.join(''));
}
function woodArt() {
  const rand = generator(18292), paths = ['<rect width="512" height="1024" fill="#4a3322"/>'];
  for (let i = -4; i < 190; i++) {
    const x = i * 2.85, wave = 2 + rand() * 6;
    paths.push(`<path d="M${n(x)} -4 C${n(x + wave)} 190 ${n(x - wave)} 330 ${n(x)} 510 S${n(x + wave)} 830 ${n(x)} 1028" fill="none" stroke="${i % 3 ? '#a06f43' : '#100d0b'}" stroke-width="${n(.35 + rand() * 1.4)}" opacity="${n(.06 + rand() * .24)}"/>`);
  }
  for (let i = 0; i < 7; i++) {
    const x = n(40 + rand() * 430), y = n(70 + rand() * 880);
    for (let k = 0; k < 5; k++) paths.push(`<ellipse cx="${x}" cy="${y}" rx="${6 + k * 3}" ry="${19 + k * 9}" fill="none" stroke="#160e08" stroke-width=".9" opacity="${.28 - k * .045}"/>`);
  }
  return art(512, 1024, paths.join(''));
}
function metalArt() {
  const rand = generator(8872), paths = ['<rect width="1024" height="1024" fill="#9ca0a1"/>'];
  for (let i = 0; i < 2100; i++) {
    const x = n(rand() * 1024), y = n(rand() * 1024);
    paths.push(`<path d="M${x} ${y}h${n(1 + rand() * 8)}" stroke="${i % 2 ? '#373f40' : '#e2e7e3'}" stroke-width=".65" opacity=".13"/>`);
  }
  for (let i = 0; i < 190; i++) {
    const x = n(rand() * 1024), y = n(rand() * 1024);
    paths.push(`<path d="M${x} ${y}l${n(12 + rand() * 180)} ${n(rand() * 5)}" fill="none" stroke="${i % 4 ? '#394241' : '#edf0e8'}" stroke-width="${n(.45 + rand() * .75)}" opacity=".17"/>`);
  }
  return art(1024, 1024, paths.join(''));
}
function leatherArt() {
  const rand = generator(89382), paths = ['<rect width="1024" height="1024" fill="#745139"/>'];
  for (let i = 0; i < 3800; i++) paths.push(`<ellipse cx="${n(rand() * 1024)}" cy="${n(rand() * 1024)}" rx="${n(.4 + rand() * 1.4)}" ry=".6" fill="${i % 3 ? '#25170a' : '#c49963'}" opacity=".2"/>`);
  for (let i = -3; i < 12; i++) paths.push(`<path d="M-4 ${i * 112}l1032 320" stroke="#24170e" stroke-width="3" opacity=".7"/><path d="M-4 ${i * 112 + 5}l1032 320" stroke="#bf9571" stroke-width="1" opacity=".28"/>`);
  return art(1024, 1024, paths.join(''));
}
function endgrainArt() {
  const paths = ['<rect width="1024" height="1024" fill="#745c3d"/>'];
  for (let r = 14; r < 760; r += 12) {
    let d = '';
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 2, radius = r + Math.sin(a * 7 + r * .03) * 4;
      d += `${i ? 'L' : 'M'}${n(490 + Math.cos(a) * radius)} ${n(530 + Math.sin(a) * radius * .97)}`;
    }
    paths.push(`<path d="${d}Z" fill="none" stroke="#302617" stroke-width="${r % 24 ? 1.2 : 2.4}" opacity=".3"/>`);
  }
  paths.push('<path d="M210 160l114 158-7 17 M840 751l-191-84 5-16 M586 64l-13 235 11 23" fill="none" stroke="#40301d" stroke-width="3"/>');
  return art(1024, 1024, paths.join(''));
}
function eyeArt() {
  const paths = ['<defs><radialGradient id="iris"><stop stop-color="#ffe57c"/><stop offset=".27" stop-color="#ff8c32"/><stop offset=".67" stop-color="#b02b17"/><stop offset="1" stop-color="#290d09"/></radialGradient><clipPath id="lid"><path d="M60 256C250 20 750 20 964 256C750 480 250 480 60 256Z"/></clipPath></defs><g clip-path="url(#lid)"><rect width="1024" height="512" fill="url(#iris)"/>'];
  const rand = generator(19272);
  for (let i = 0; i < 150; i++) {
    const a = i / 150 * Math.PI * 2, r = 130 + rand() * 170;
    paths.push(`<path d="M${n(512 + Math.cos(a) * 52)} ${n(256 + Math.sin(a) * 42)}Q${n(512 + Math.cos(a + .04) * r)} ${n(256 + Math.sin(a + .04) * r * .7)} ${n(512 + Math.cos(a) * r * 2)} ${n(256 + Math.sin(a) * r)}" fill="none" stroke="#3a0f06" stroke-width="${n(.7 + rand() * 1.8)}" opacity=".4"/>`);
  }
  paths.push('<path d="M512 55C480 175 478 340 512 458C547 340 544 175 512 55Z" fill="#050705"/></g>');
  return art(1024, 512, paths.join(''));
}
function anvilArt() {
  const rand = generator(729184), paths = ['<rect width="1024" height="424" fill="#8a9492"/>'];
  for (let i = 0; i < 450; i++) paths.push(`<path d="M${n(rand() * 1024)} ${n(rand() * 424)}l${n((rand() - .5) * 70)} ${n(rand() * 20)}" stroke="#1c2222" stroke-width="${n(.4 + rand())}" opacity="${n(.08 + rand() * .25)}"/>`);
  for (let i = 0; i < 90; i++) paths.push(`<ellipse cx="${n(rand() * 1024)}" cy="${n(rand() * 424)}" rx="${n(1 + rand() * 5)}" ry="${n(1 + rand() * 2)}" fill="#232828" opacity=".19"/>`);
  return art(1024, 424, paths.join(''));
}
export const WORKSHOP_ART = {
  stone: stoneArt(), wood: woodArt(), metal: metalArt(), leather: leatherArt(), endgrain: endgrainArt(), eye: eyeArt(),
  anvil: anvilArt(),
  cloth: art(1024, 1024, '<defs><pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 3h12M3 0v12" stroke="#cadfd3" stroke-width="1" opacity=".16"/><path d="M0 9h12M9 0v12" stroke="#233b3b" stroke-width="1" opacity=".18"/></pattern></defs><rect width="1024" height="1024" fill="#8caaa8"/><rect width="1024" height="1024" fill="url(#weave)"/>'),
  warning: art(128, 128, '<g stroke="#fff" stroke-width="7" stroke-linejoin="round" fill="none"><path d="M18 83C29 106 77 110 81 76S55 71 56 42L68 25 95 36 110 32 101 48 76 47"/></g><path d="M57 69L24 49 26 26 43 46 66 48ZM67 31L69 11 78 28Z" fill="#fff"/>'),
};

export function ledgerArt(data = {}) {
  const w = 1536, h = 752, paths = ['<rect width="1536" height="752" fill="#30291f"/>'];
  for (let i = 0; i < 65; i++) paths.push(`<path d="M0 ${i * 12}C400 ${i * 12 + 8} 900 ${i * 12 - 5} 1536 ${i * 12}" fill="none" stroke="#9b7541" stroke-width="3" opacity=".045"/>`);
  paths.push('<rect x="24" y="24" width="1488" height="704" fill="none" stroke="#b28a47" stroke-width="2"/>');
  const text = (value, x, y, size, color, anchor = 'start', weight = 400) => paths.push(svgText(String(value), x, y, {size, color, anchor, weight}));
  text('THE BLACKSMITH’S LEDGER  /  锻造记录', 72, 79, 30, '#d3b783');
  const name = data.name || '将剑放上铁砧', shortName = [...name].slice(0, 17).join('') + ([...name].length > 17 ? '…' : '');
  text(shortName, 72, 179, Math.min(69, 1190 / Math.max(1, [...shortName].length)), '#f2e5c8', 'start', 700);
  text(`+${data.level || 0}`, w - 72, 179, 69, '#edc773', 'end', 700);
  text('TRIBUTE VALUE  /  贡品价值', 75, 265, 30, '#b4a58c');
  text(`${Math.round(data.value || 0).toLocaleString()} G`, w - 72, 289, 62, '#f7df9e', 'end', 700);
  const names = ['BREAK 碎裂', 'DAMAGE 损伤', 'HOLD 保持', 'SUCCESS 成功', 'GREAT 大成功'];
  const colors = ['#e88371', '#dbb769', '#b4ca9a', '#9dced6', '#d9a8d7'];
  const odds = data.odds || {break:.05,damage:.1,hold:.2,success:.55,great:.1};
  ['break','damage','hold','success','great'].forEach((kind, i) => {
    const x = 74 + i * 282;
    paths.push(`<path d="M${x} 389h246" stroke="${colors[i]}" stroke-width="4"/>`);
    text(names[i], x + 123, 438, 30, colors[i], 'middle', 600);
    text(`${((odds[kind] || 0) * 100).toFixed(1)}%`, x + 123, 510, 47, colors[i], 'middle', 700);
  });
  const charge = Math.max(0, Math.min(10, data.charge || 0));
  text(data.frenzy ? 'FRENZY / 狂热：碎裂已被封印' : 'TEMPER / 连击蓄能', 75, 609, 29, data.frenzy ? '#f8c46d' : '#b8aa91');
  for (let i = 0; i < 10; i++) paths.push(`<rect x="${660 + i * 76}" y="592" width="56" height="22" fill="${i < charge ? '#ffd084' : '#514736'}"/>`);
  text('ONE STRIKE. ONE FORTUNE.', 75, 697, 25, '#9b8b6d'); text(`${charge} / 10`, w - 75, 697, 25, '#9b8b6d', 'end');
  return art(w, h, paths.join(''));
}

export function calendarArt(day = 1) {
  const date = new Date(Date.UTC(2026, 3, 14 + day)), month = date.getUTCMonth(), year = date.getUTCFullYear(), current = date.getUTCDate();
  const paths = ['<rect width="512" height="773" fill="#c9bea1"/>'];
  const text = (value, x, y, size, color = '#493c2b') => paths.push(svgText(String(value), x, y, {size, color, anchor:'middle'}));
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  text(months[month], 256, 92, 71); text('THE DRAGON’S DUE', 256, 146, 20);
  paths.push('<path d="M36 173H476" stroke="#827359" stroke-width="1"/>');
  const start = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7, count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  ['M','T','W','T','F','S','S'].forEach((s, i) => text(s, 51 + i * 68, 199, 19));
  for (let d = 1; d <= count; d++) {
    const cell = start + d - 1, x = 51 + cell % 7 * 68, y = 253 + Math.floor(cell / 7) * 81;
    paths.push(`<path d="M${x - 27} ${y + 27}h54" stroke="#9c8c6e"/>`); text(d, x, y - 10, 34, '#51432e');
    const contractDay = Math.floor((Date.UTC(year, month, d) - Date.UTC(2026, 3, 15)) / 86400000) + 1;
    if (d < current) paths.push(`<path d="M${x - 18} ${y - 26}l35 35m0-35l-35 35" stroke="#863d31" stroke-width="2"/>`);
    if (d === current) paths.push(`<ellipse cx="${x}" cy="${y - 10}" rx="25" ry="30" transform="rotate(-7 ${x} ${y - 10})" fill="none" stroke="#963b2d" stroke-width="3"/>`);
    if (contractDay >= 3 && contractDay % 3 === 0) paths.push(`<path d="M${x} ${y + 9}v14m-12-13h24m-20 13h16m-17-13l-4 8h8Zm18 0l-4 8h8Z" fill="none" stroke="#387d84" stroke-width="2"/>`);
    if (contractDay === 1 || contractDay === 21) text(contractDay === 1 ? 'START' : 'CLEAR', x, y - 36, 11, '#6d6146');
  }
  text(`${month === 3 ? 'APR' : month === 4 ? 'MAY' : month + 1} ${current} · DAY ${day}`, 256, 721, 23, '#534633');
  return art(512, 773, paths.join(''));
}
