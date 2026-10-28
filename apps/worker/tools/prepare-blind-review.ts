import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

// Accept only public match identity. Predictions and source reports cannot enter
// the review document through this contract.
const selectionSchema = z.array(z.strictObject({
  matchKey: z.string().regex(/^2026cacg_qm\d+$/),
  split: z.enum(["calibration", "heldout"]),
  videoKey: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  url: z.string(),
  red: z.array(z.string().regex(/^frc\d+$/)).length(3),
  blue: z.array(z.string().regex(/^frc\d+$/)).length(3),
})).min(1).refine(rows => new Set(rows.map(row => row.matchKey)).size === rows.length);

export function prepareReview(selection: unknown) {
  const matches = selectionSchema.parse(selection);
  for (const match of matches) {
    if (match.url !== `https://www.youtube.com/watch?v=${match.videoKey}`)
      throw new Error("Video URL must match its public video ID");
    if (new Set([...match.red, ...match.blue]).size !== 6)
      throw new Error("Expected six distinct robots");
  }
  const manifest = { version: 1, matches };
  const manifestSha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const review = {
    version: 1, manifestSha256, reviewer: "", reviewedAt: null,
    matches: matches.map(({ matchKey, videoKey, red, blue }) => ({
      matchKey, videoKey, videoStartSeconds: null,
      counts: ([...red.map(team => ({ alliance: "red", actor: team })),
        ...blue.map(team => ({ alliance: "blue", actor: team })),
        { alliance: "red", actor: "human-player" },
        { alliance: "blue", actor: "human-player" }] as const).flatMap(actor =>
        ["auto", "teleop"].map(phase => ({ ...actor, phase,
          scoredFuelMin: null, scoredFuelMax: null, inactiveHubEntries: null,
          visibility: "unreviewed", notes: "" }))),
      // Each burst uses video time, not a report/OCR-derived match clock.
      events: [], notes: "",
    })),
  };
  const payload = JSON.stringify(review).replaceAll("<", "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CalGames independent fuel review</title>
<style>body{font:16px system-ui;max-width:1200px;margin:32px auto;padding:0 20px;background:#10151f;color:#e8edf7}a{color:#8dccff}input,select,textarea,button{font:inherit;background:#202b3c;color:inherit;border:1px solid #607087;border-radius:5px;padding:7px}input[type=number]{width:75px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{text-align:left;padding:7px;border-bottom:1px solid #364358}textarea{width:95%;min-height:60px}button{cursor:pointer;background:#245392}section{margin:32px 0}small{color:#bac7dc}.scroll{overflow-x:auto}</style>
<h1>Independent fuel review</h1>
<p>Count from the video without consulting scout reports, OCR or model estimates. Keep human-player fuel separate from each robot. Leave unknown values blank; enter zero only after reviewing the full phase. Use lower and upper bounds where identity or ball counts are uncertain.</p>
<p>Scored counts mean point-eligible fuel in an active hub, rather than shots attempted. Record entries into an inactive hub separately. Teleop includes endgame fuel. Do not add tower points or foul credits to fuel counts. If the video does not show enough evidence, mark it partial or occluded.</p>
<p>Check the three-second scoring assessment window after AUTO, TELEOP and hub deactivation. Record uncertain boundary arrivals in the notes rather than assigning them by an arbitrary time shift. See <a href="https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm" target="_blank" rel="noopener noreferrer">official manual sections 6.4–6.5</a>.</p>
<p>Use video timestamps for burst evidence. Record the video timestamp where the match begins. Do not infer phase timing from a scout report. The separate reviewer guide describes the event format.</p>
<label>Reviewer <input id="reviewer" autocomplete="off"></label> <button id="save">Download review JSON</button><p id="status" role="status">Changes stay in this page until downloaded. Download before closing.</p><main id="matches"></main>
<script type="application/json" id="initial">${payload}</script>
<script>
const data=JSON.parse(document.querySelector('#initial').textContent);
const root=document.querySelector('#matches');
function field(tag,parent,props={}){const el=document.createElement(tag);Object.assign(el,props);parent.append(el);return el}
function number(parent,obj,key){const el=field('input',parent,{type:'number',min:'0',step:'1',ariaLabel:key});el.oninput=()=>{obj[key]=el.value===''?null:Number(el.value)};return el}
for(const m of data.matches){
 const section=field('section',root);field('h2',section,{textContent:m.matchKey});
 field('a',section,{textContent:'Open match video',href:'https://www.youtube.com/watch?v='+m.videoKey,target:'_blank',rel:'noopener noreferrer'});
 const start=field('p',section,{textContent:'Match begins at video second: '});number(start,m,'videoStartSeconds');
 const table=field('table',field('div',section,{className:'scroll'}));const head=field('tr',field('thead',table));
 for(const title of ['Alliance / actor','Phase','Scored min','Scored max','Inactive entries','Visibility','Evidence / uncertainty'])field('th',head,{textContent:title});
 const body=field('tbody',table);
 for(const c of m.counts){const row=field('tr',body);field('td',row,{textContent:c.alliance+' / '+c.actor});field('td',row,{textContent:c.phase});
 for(const key of ['scoredFuelMin','scoredFuelMax','inactiveHubEntries'])number(field('td',row),c,key);
 const sel=field('select',field('td',row));for(const value of ['unreviewed','complete','partial','occluded'])field('option',sel,{textContent:value,value});sel.onchange=()=>c.visibility=sel.value;
 const notes=field('textarea',field('td',row),{ariaLabel:'Evidence notes'});notes.oninput=()=>c.notes=notes.value;}
 field('p',section,{textContent:'Optional burst evidence (JSON array; see guide):'});const events=field('textarea',section,{value:'[]'});events.oninput=()=>{try{const value=JSON.parse(events.value);if(!Array.isArray(value))throw Error();m.events=value;events.setCustomValidity('')}catch{events.setCustomValidity('Enter a JSON array')}};
 const notes=field('textarea',section,{placeholder:'Match-wide uncertainty, camera cuts, phase boundary evidence'});notes.oninput=()=>m.notes=notes.value;
}
document.querySelector('#save').onclick=()=>{
 const invalid=[...document.querySelectorAll('input,textarea')].find(el=>!el.reportValidity());if(invalid)return;
 for(const m of data.matches)for(const c of m.counts){const a=c.scoredFuelMin,b=c.scoredFuelMax;if(a!==null&&b!==null&&a>b){document.querySelector('#status').textContent='Lower bound exceeds upper bound: '+m.matchKey+' '+c.actor+' '+c.phase;return}}
 data.reviewer=document.querySelector('#reviewer').value.trim();data.reviewedAt=new Date().toISOString();
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='calgames-independent-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.querySelector('#status').textContent='Downloaded. Keep the original file before making revisions.';
};
</script>`;
  return { manifest: { ...manifest, sha256: manifestSha256 }, review, html };
}

if (import.meta.main) {
  const [source, destination] = Bun.argv.slice(2);
  if (!source || !destination) throw new Error("Use prepare-blind-review.ts SELECTION_JSON EMPTY_DIRECTORY");
  const prepared = prepareReview(JSON.parse(await readFile(source, "utf8")));
  const output = resolve(destination);
  await mkdir(output, { recursive: true, mode: 0o700 });
  if ((await readdir(output)).length) throw new Error("Review output must be empty");
  for (const [name, value] of Object.entries({ "manifest.json": JSON.stringify(prepared.manifest, null, 2),
    "blank-review.json": JSON.stringify(prepared.review, null, 2), "review.html": prepared.html }))
    await writeFile(join(output, name), value + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ output, matches: prepared.review.matches.length, manifestSha256: prepared.manifest.sha256 }));
}
