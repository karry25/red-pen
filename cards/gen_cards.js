// Generates code-drawn study cards (SVG) for Ch.1 topics.
// Accurate chemistry, cozy palette, 800x500. Rendered to PNG by
// gen_cards.sh (headless Chrome) so runtime stays zero-dependency.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'svg');
fs.mkdirSync(OUT, { recursive: true });

const C = {
  bg: '#fffdf6', ink: '#3d3833', soft: '#8b8178', pen: '#b8503c',
  sage: '#6f9272', amber: '#c08a2d', sky: '#7d94b5', line: '#e9dfd0', panel: '#faf6ec',
};

function frame(title, subtitle, body, source = 'Source: NCERT Class 10 Science, Ch.1 · Red Pen') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="${C.bg}"/>
  <rect x="16" y="16" width="768" height="468" rx="20" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>
  <text x="40" y="62" font-family="Georgia, serif" font-size="30" font-weight="700" fill="${C.ink}">${title}</text>
  <text x="40" y="90" font-family="Georgia, serif" font-size="16" font-style="italic" fill="${C.pen}">${subtitle}</text>
  ${body}
  <text x="40" y="468" font-family="sans-serif" font-size="12" fill="${C.soft}">${source}</text>
</svg>`;
}

function box(x, y, w, h, fill, stroke) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}
function txt(x, y, s, size = 18, fill = C.ink, anchor = 'start', weight = 600, family = 'sans-serif') {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
}
function arrow(x1, y1, x2, y2, color = C.pen) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const hx = x2 - ux * 14, hy = y2 - uy * 14;
  return `<line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="3"/>
  <polygon points="${x2},${y2} ${hx - uy * 7},${hy + ux * 7} ${hx + uy * 7},${hy - ux * 7}" fill="${color}"/>`;
}

const cards = {};

// 1. Four reaction types
cards['reaction-types'] = frame('4 reaction types', 'pattern yaad rakho, reaction pehchan lo', [
  box(40, 120, 340, 150, '#eef4ec', C.sage),
  txt(60, 150, 'Combination', 20, C.sage, 'start', 700, 'Georgia, serif'),
  txt(60, 185, 'A + B', 22, C.ink), arrow(180, 178, 240, 178, C.sage), txt(250, 185, 'AB', 22, C.ink),
  txt(60, 215, 'ek se ek banta hai', 14, C.soft),
  txt(60, 245, 'CaO + H2O → Ca(OH)2', 15, C.ink),
  box(420, 120, 340, 150, '#f8ece8', C.pen),
  txt(440, 150, 'Decomposition', 20, C.pen, 'start', 700, 'Georgia, serif'),
  txt(440, 185, 'AB', 22, C.ink), arrow(500, 178, 560, 178, C.pen), txt(570, 185, 'A + B', 22, C.ink),
  txt(440, 215, 'ek toot ke kai banta hai', 14, C.soft),
  txt(440, 245, 'CaCO3 → CaO + CO2', 15, C.ink),
  box(40, 290, 340, 150, '#edf1f7', C.sky),
  txt(60, 320, 'Displacement', 20, C.sky, 'start', 700, 'Georgia, serif'),
  txt(60, 355, 'A + BC', 22, C.ink), arrow(200, 348, 260, 348, C.sky), txt(270, 355, 'AC + B', 22, C.ink),
  txt(60, 385, 'strong ne weak ko bhagaya', 14, C.soft),
  txt(60, 415, 'Fe + CuSO4 → FeSO4 + Cu', 15, C.ink),
  box(420, 290, 340, 150, '#faf3e2', C.amber),
  txt(440, 320, 'Double displacement', 20, C.amber, 'start', 700, 'Georgia, serif'),
  txt(440, 355, 'AB + CD', 22, C.ink), arrow(580, 348, 640, 348, C.amber), txt(650, 355, 'AD + CB', 22, C.ink),
  txt(440, 385, 'dono ne partners badle', 14, C.soft),
  txt(440, 415, 'Na2SO4 + BaCl2 → BaSO4↓ + 2NaCl', 15, C.ink),
].join(''));

// 2. Balancing steps
cards['balancing-steps'] = frame('Balancing, step by step', 'kabhi formula mat badlo, sirf coefficients', [
  box(40, 115, 720, 70, '#fff', C.line),
  txt(60, 145, 'Goal: har element ke atoms left = right', 18, C.ink),
  txt(60, 172, '(law of conservation of mass - atoms na bante, na mitte)', 13, C.soft),
  box(40, 205, 720, 70, '#fff', C.line),
  txt(60, 235, '1. Count atoms both sides:  Fe + H2O → Fe3O4 + H2', 18, C.ink),
  txt(60, 262, 'Fe: 1 vs 3   O: 1 vs 4   H: 2 vs 2', 13, C.soft),
  box(40, 295, 720, 70, '#fff', C.line),
  txt(60, 325, '2. Fix one element at a time with coefficients', 18, C.ink),
  txt(60, 352, 'Fe: 3Fe    O: 4H2O    H: 4H2', 13, C.soft),
  box(40, 385, 720, 70, '#eef4ec', C.sage),
  txt(60, 415, '3Fe + 4H2O → Fe3O4 + 4H2', 20, C.sage, 'start', 700),
  txt(60, 442, 'Fe: 3=3   O: 4=4   H: 8=8   balanced!', 13, C.sage),
].join(''));

// 3. Exo vs endo energy
cards['exo-endo'] = frame('Exothermic vs endothermic', 'heat nikalti hai ya andar jati hai', [
  txt(60, 130, 'EXOTHERMIC (heat out)', 17, C.pen, 'start', 700),
  box(60, 145, 300, 40, '#f8ece8', C.pen), txt(210, 172, 'reactants (high energy)', 13, C.ink, 'middle'),
  arrow(210, 190, 210, 260, C.pen),
  txt(230, 235, 'heat + energy released', 13, C.pen),
  box(60, 265, 300, 40, '#fff', C.line), txt(210, 292, 'products (low energy)', 13, C.ink, 'middle'),
  txt(60, 340, 'burning · respiration · CaO + paani', 14, C.soft),
  txt(440, 130, 'ENDOTHERMIC (heat in)', 17, C.sky, 'start', 700),
  box(440, 265, 300, 40, '#edf1f7', C.sky), txt(590, 292, 'reactants (low energy)', 13, C.ink, 'middle'),
  arrow(590, 260, 590, 190, C.sky),
  txt(608, 235, 'heat absorbed', 13, C.sky),
  box(440, 145, 300, 40, '#fff', C.line), txt(590, 172, 'products (high energy)', 13, C.ink, 'middle'),
  txt(440, 340, 'CaCO3 ka decomposition · photosynthesis', 14, C.soft),
  box(60, 380, 680, 60, '#faf3e2', C.amber),
  txt(80, 415, 'Exam tip: "exo" = exit (heat bahar), "endo" = andar (heat andar)', 16, C.amber, 'start', 700),
].join(''));

// 4. Rusting + prevention
cards['corrosion-rusting'] = frame('Rusting of iron', 'corrosion ka sabse famous case', [
  box(40, 120, 720, 80, '#fff', C.line),
  txt(60, 152, 'iron + oxygen + water (moisture)', 18, C.ink),
  arrow(430, 145, 500, 145),
  txt(510, 152, 'Fe2O3·xH2O (rust)', 18, C.pen, 'start', 700),
  txt(60, 182, 'brown flaky layer - metal weak hota jata hai', 13, C.soft),
  txt(60, 240, 'Rokne ke 4 tareeke:', 18, C.ink, 'start', 700),
  box(40, 258, 340, 70, '#eef4ec', C.sage), txt(60, 288, '1. Painting / oiling', 16, C.ink), txt(60, 312, 'surface band - hawa-paani bahar', 12, C.soft),
  box(420, 258, 340, 70, '#eef4ec', C.sage), txt(440, 288, '2. Galvanisation', 16, C.ink), txt(440, 312, 'zinc coating (zinc pehle react karta hai)', 12, C.soft),
  box(40, 345, 340, 70, '#eef4ec', C.sage), txt(60, 375, '3. Alloying', 16, C.ink), txt(60, 399, 'stainless steel = iron + chromium', 12, C.soft),
  box(420, 345, 340, 70, '#eef4ec', C.sage), txt(440, 375, '4. Greasing', 16, C.ink), txt(440, 399, 'cycle chain pe grease, same logic', 12, C.soft),
].join(''));

// 5. Electrolysis of water
cards['electrolysis-water'] = frame('Electrolysis of water', 'electrolytic decomposition', [
  txt(60, 130, '2H2O (acidified)', 20, C.ink),
  arrow(300, 122, 400, 122),
  txt(320, 108, 'electricity', 13, C.amber, 'middle'),
  txt(420, 130, '2H2 + O2', 20, C.pen, 'start', 700),
  box(60, 170, 320, 200, '#edf1f7', C.sky),
  txt(220, 200, 'CATHODE (-)', 15, C.sky, 'middle', 700),
  txt(220, 240, 'H2 gas', 22, C.ink, 'middle', 700),
  txt(220, 270, 'DOUBLE the volume', 14, C.soft, 'middle'),
  txt(220, 300, 'pop sound with', 13, C.soft, 'middle'),
  txt(220, 318, 'burning splinter', 13, C.soft, 'middle'),
  box(420, 170, 320, 200, '#f8ece8', C.pen),
  txt(580, 200, 'ANODE (+)', 15, C.pen, 'middle', 700),
  txt(580, 240, 'O2 gas', 22, C.ink, 'middle', 700),
  txt(580, 270, 'half the volume', 14, C.soft, 'middle'),
  txt(580, 300, 'glowing splinter', 13, C.soft, 'middle'),
  txt(580, 318, 're-lights', 13, C.soft, 'middle'),
  box(60, 400, 680, 55, '#faf3e2', C.amber),
  txt(80, 433, 'Volume ratio H2:O2 = 2:1 - direct board question!', 16, C.amber, 'start', 700),
].join(''));

// 6. Decomposition types tree
cards['decomposition-types'] = frame('Decomposition: 3 types', 'ek reactant tootta hai - kaaran yaad rakho', [
  box(250, 115, 300, 55, '#f8ece8', C.pen),
  txt(400, 148, 'AB → A + B', 22, C.pen, 'middle', 700),
  arrow(320, 170, 150, 225), arrow(400, 170, 400, 225), arrow(480, 170, 650, 225),
  box(40, 230, 220, 190, '#fff', C.amber),
  txt(150, 260, 'THERMAL', 16, C.amber, 'middle', 700),
  txt(150, 285, '(heat se)', 13, C.soft, 'middle'),
  txt(150, 320, 'CaCO3 →', 15, C.ink, 'middle'),
  txt(150, 342, 'CaO + CO2', 15, C.ink, 'middle'),
  txt(150, 375, '2FeSO4 →', 15, C.ink, 'middle'),
  txt(150, 397, 'Fe2O3+SO2+SO3', 15, C.ink, 'middle'),
  box(290, 230, 220, 190, '#fff', C.sky),
  txt(400, 260, 'ELECTROLYTIC', 16, C.sky, 'middle', 700),
  txt(400, 285, '(electricity se)', 13, C.soft, 'middle'),
  txt(400, 320, '2H2O →', 15, C.ink, 'middle'),
  txt(400, 342, '2H2 + O2', 15, C.ink, 'middle'),
  txt(400, 375, 'acidified water', 13, C.soft, 'middle'),
  txt(400, 397, '(drops of dil. H2SO4)', 13, C.soft, 'middle'),
  box(540, 230, 220, 190, '#fff', C.sage),
  txt(650, 260, 'PHOTOLYTIC', 16, C.sage, 'middle', 700),
  txt(650, 285, '(light se)', 13, C.soft, 'middle'),
  txt(650, 320, '2AgCl →', 15, C.ink, 'middle'),
  txt(650, 342, '2Ag + Cl2', 15, C.ink, 'middle'),
  txt(650, 375, '2AgBr →', 15, C.ink, 'middle'),
  txt(650, 397, '2Ag + Br2', 15, C.ink, 'middle'),
].join(''));


// ---- Chapter 2 cards ----
const SRC2 = 'Source: NCERT Class 10 Science, Ch.2 · Red Pen';

// pH scale 0-14
{
  const seg = [];
  const cols = ['#e8b4a8','#eabfae','#eccab4','#eed5ba','#f0dfc0','#f2e9c8','#eef0c9','#cfe3c0','#bcd8c4','#abcdd0','#9ac2d6','#8db4d8','#87a6d4','#8598cc','#8a8cc2'];
  for (let i = 0; i < 14; i++) {
    seg.push(`<rect x="${70 + i * 47}" y="150" width="45" height="46" rx="8" fill="${cols[i]}" stroke="${C.line}"/>`);
    seg.push(txt(70 + i * 47 + 22.5, 180, String(i + 1), 15, C.ink, 'middle', 700));
  }
  seg.push(txt(70, 140, '0', 15, C.pen, 'start', 700));
  seg.push(txt(70 + 6 * 47 + 22.5, 230, '7 = NEUTRAL (pure water)', 15, C.sage, 'middle', 700));
  seg.push(arrow(70 + 3 * 47, 265, 70 + 1 * 47, 265, C.pen));
  seg.push(txt(70, 290, 'ACIDIC (zyada H3O+ ions)', 15, C.pen, 'start', 700));
  seg.push(txt(70, 315, 'lemon juice, vinegar, stomach HCl', 13, C.soft));
  seg.push(txt(70 + 9 * 47, 290, 'BASIC (zyada OH- ions)', 15, C.sky, 'start', 700));
  seg.push(txt(70 + 9 * 47, 315, 'NaOH solution, soap, baking soda', 13, C.soft));
  seg.push(box(70, 350, 660, 70, '#fff', C.amber));
  seg.push(txt(400, 380, 'YAAD RAKHO: pH ulta chalta hai - jitna ZYADA H3O+,', 15, C.ink, 'middle'));
  seg.push(txt(400, 405, 'utna KAM pH number. (p = potenz = power)', 15, C.ink, 'middle'));
  cards['ph-scale'] = frame('The pH scale (0-14)', 'neutral 7 · neeche acid · upar base', seg.join(''), SRC2);
}

// Neutralisation loop (phenolphthalein)
cards['neutralisation-loop'] = frame('Neutralisation loop', 'Activity 2.6 - pink, gone, pink again', [
  box(60, 130, 300, 110, '#f8ece8', C.pen),
  txt(210, 165, 'NaOH + phenolphthalein', 16, C.ink, 'middle'),
  txt(210, 195, '= PINK solution', 20, C.pen, 'middle', 700),
  txt(210, 222, '(base zyada hai)', 13, C.soft, 'middle'),
  box(440, 130, 300, 110, '#eef4ec', C.sage),
  txt(590, 165, '+ dilute HCl, drop by drop', 16, C.ink, 'middle'),
  txt(590, 195, '= COLOURLESS', 20, C.sage, 'middle', 700),
  txt(590, 222, '(exactly neutralised)', 13, C.soft, 'middle'),
  box(250, 280, 300, 100, '#fdf3e3', C.amber),
  txt(400, 315, '+ thoda NaOH wapas', 16, C.ink, 'middle'),
  txt(400, 345, '= PINK AGAIN', 20, C.amber, 'middle', 700),
  arrow(360, 185, 440, 185),
  arrow(500, 240, 430, 280, C.amber),
  arrow(300, 280, 230, 240, C.pen),
  txt(400, 425, 'NaOH + HCl → NaCl + H2O   (base + acid → salt + water)', 17, C.ink, 'middle', 700),
].join(''), SRC2);

// Common-salt family tree
cards['salt-family'] = frame('Common salt ki family', 'ek NaCl se itne saare chemicals', [
  box(280, 115, 240, 62, '#fdf3e3', C.amber),
  txt(400, 145, 'Common salt (NaCl)', 17, C.ink, 'middle', 700),
  txt(400, 168, '+ paani = brine', 13, C.soft, 'middle'),
  box(40, 225, 220, 120, '#eef4ec', C.sage),
  txt(150, 255, 'NaOH (caustic soda)', 15, C.sage, 'middle', 700),
  txt(150, 280, 'chlor-alkali:', 13, C.ink, 'middle'),
  txt(150, 300, 'brine + electricity', 13, C.ink, 'middle'),
  txt(150, 325, 'Cl2 anode · H2 cathode', 12, C.soft, 'middle'),
  box(290, 225, 220, 120, '#f8ece8', C.pen),
  txt(400, 255, 'Baking soda', 15, C.pen, 'middle', 700),
  txt(400, 278, 'NaHCO3', 14, C.ink, 'middle'),
  txt(400, 300, 'NaCl+H2O+CO2+NH3', 12, C.soft, 'middle'),
  txt(400, 325, 'heat → Na2CO3', 12, C.soft, 'middle'),
  box(540, 225, 220, 120, '#eef1f6', C.sky),
  txt(650, 255, 'Bleaching powder', 15, C.sky, 'middle', 700),
  txt(650, 280, 'Cl2 + dry slaked lime', 13, C.ink, 'middle'),
  txt(650, 300, 'Ca(ClO)2 (NCERT)', 12, C.soft, 'middle'),
  txt(650, 325, 'drinking water germ-free', 12, C.soft, 'middle'),
  box(400, 380, 220, 60, '#fff', C.pen),
  txt(510, 405, 'Washing soda', 15, C.pen, 'middle', 700),
  txt(510, 427, 'Na2CO3.10H2O (recrystallised)', 12, C.soft, 'middle'),
  arrow(350, 177, 170, 225, C.sage),
  arrow(400, 177, 400, 225, C.pen),
  arrow(450, 177, 640, 225, C.sky),
  arrow(455, 345, 500, 380, C.pen),
].join(''), SRC2);

// POP cycle
cards['pop-cycle'] = frame('Gypsum ↔ Plaster of Paris', 'water of crystallisation in action', [
  box(60, 150, 280, 130, '#eef4ec', C.sage),
  txt(200, 185, 'GYPSUM', 20, C.sage, 'middle', 700),
  txt(200, 215, 'CaSO4.2H2O', 18, C.ink, 'middle'),
  txt(200, 245, '(2 water molecules)', 13, C.soft, 'middle'),
  box(460, 150, 280, 130, '#fdf3e3', C.amber),
  txt(600, 185, 'PLASTER OF PARIS', 18, C.amber, 'middle', 700),
  txt(600, 215, 'CaSO4.½H2O', 18, C.ink, 'middle'),
  txt(600, 245, '(calcium sulphate hemihydrate)', 12, C.soft, 'middle'),
  arrow(340, 195, 460, 195),
  txt(400, 180, 'heat 373 K', 14, C.pen, 'middle', 700),
  arrow(460, 240, 340, 240, C.sky),
  txt(400, 265, '+ 1½ H2O (sets hard)', 14, C.sky, 'middle', 700),
  box(150, 330, 500, 90, '#fff', C.line),
  txt(400, 362, 'Uses: fractured-bone plaster, toys, moulds,', 15, C.ink, 'middle'),
  txt(400, 388, 'smooth surfaces. ½H2O = 2 CaSO4 share 1 water!', 15, C.ink, 'middle'),
].join(''), SRC2);

for (const [name, svg] of Object.entries(cards)) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
}
console.log('wrote', Object.keys(cards).length, 'cards to', OUT);
