import assert from 'node:assert/strict';
import {BOARD_BOOK, BASE_PAGE_WIDTH, pageHeight, pagePlacement, validBookPage} from '../board-book-catalog.js';
import {BoardBookPages} from '../board-book-pages.js';
import fs from 'node:fs';
const view=Object.create(BoardBookPages.prototype);
const page={id:'one',bookId:BOARD_BOOK.id,pageNumber:25,...pagePlacement(BASE_PAGE_WIDTH,.1,.08)};
view.pages=[page];
assert.equal(validBookPage(page),true);
assert.equal(validBookPage({...page,pageNumber:110}),false);
assert.equal(validBookPage({...page,width:.45,y:.8}),false);
// Portrait PDF aspect stays correct on the board's 1600x1000 logical canvas.
assert.ok(Math.abs((page.width*1600)/(pageHeight(page.width)*1000)-BOARD_BOOK.aspect)<1e-10);
const source=[.18,.32],local=view.local(source,page.id);
assert.deepEqual(view.board(local,page.id),source);
page.x+=.2;page.y+=.05;page.width*=1.5;
const moved=view.board(local,page.id);
assert.ok(Math.abs(moved[0]-(page.x+local[0]*1.5))<1e-10);
assert.ok(Math.abs(moved[1]-(page.y+local[1]*1.5))<1e-10);
view.pages.push({...page,id:'top'});
assert.equal(view.hit(moved).id,'top','Overlapping pages target the visible top sheet');
view.pages=[];assert.equal(view.board(local,'one'),null,'Removed pages hide their anchored records');
for(const width of [.01,.12,.28,.45,2]){
 const placement=pagePlacement(width,10,10);
 assert.ok(placement.x+placement.width<=1.000001);
 assert.ok(placement.y+pageHeight(placement.width)<=1.000001);
}
const rules=JSON.parse(fs.readFileSync(new URL('../../database.rules.json',import.meta.url)));
const pageRule=rules.rules.boardData.$university.$board.pages.$page['.validate'];
assert.ok(pageRule.includes(String(pageHeight(1))),'Server and client agree on PDF geometry');
console.log('OK: PDF proportions, page anchoring through move/resize, top-sheet targeting, removed-page visibility and boundary clamping.');
