import test from 'node:test';
import assert from 'node:assert/strict';
import {IntroDialogue, INTRO_DIALOGUE, shouldStartIntro} from '../src/intro-dialogue.ts';

function activePage(dialogue:IntroDialogue){const page=dialogue.current;assert.ok(page);return page;}
const ids = ['welcome','heat','forge','frenzy','odds','tribute','bell','rack','coins','gift'];
test('starts inactive and advances through the ten ordered dragon pages', () => {
  const dialogue = new IntroDialogue();
  assert.equal(dialogue.active, false);
  assert.equal(dialogue.current, null);
  assert.equal(dialogue.total, 10);
  dialogue.start();
  for (let index = 0; index < ids.length; index++) {
    assert.equal(dialogue.active, true);
    assert.equal(dialogue.index, index);
    const page=activePage(dialogue);
    assert.equal(page.id, ids[index]);
    assert.equal(page.speaker, '巨龙');
    assert.ok(page.text && page.hint);
    assert.equal(dialogue.next(), index === ids.length-1 ? null : INTRO_DIALOGUE[index+1]);
  }
  assert.equal(dialogue.active, false);
  assert.equal(dialogue.current, null);
});
test('previous clamps at the first page and navigates one page back', () => {
  const dialogue = new IntroDialogue(); dialogue.start();
  assert.equal(dialogue.previous(), INTRO_DIALOGUE[0]);
  assert.equal(dialogue.index, 0);
  dialogue.next(); dialogue.next();
  assert.equal(dialogue.previous(), INTRO_DIALOGUE[1]);
  assert.equal(dialogue.index, 1);
});
test('skip deactivates, and restarting always resets to the first page', () => {
  const dialogue = new IntroDialogue(); dialogue.start(); dialogue.next();
  dialogue.skip();
  assert.equal(dialogue.active, false); assert.equal(dialogue.current, null);
  dialogue.start(); assert.equal(dialogue.index, 0); assert.equal(dialogue.current, INTRO_DIALOGUE[0]);
  for (let index=0; index<10; index++) dialogue.next();
  dialogue.start(); assert.equal(dialogue.index, 0); assert.equal(dialogue.active, true);
});
test('inactive navigation never activates or exposes a page', () => {
  const dialogue = new IntroDialogue();
  assert.equal(dialogue.next(), null); assert.equal(dialogue.previous(), null);
  dialogue.skip(); assert.equal(dialogue.active, false); assert.equal(dialogue.current, null);
  dialogue.start(); dialogue.skip();
  assert.equal(dialogue.next(), null); assert.equal(dialogue.previous(), null);
});
test('only a fresh game or an empty contract slot starts the intro', () => {
  assert.equal(shouldStartIntro(false, true), false);
  assert.equal(shouldStartIntro(true, true), true);
  assert.equal(shouldStartIntro(false, false), true);
  assert.equal(shouldStartIntro(true, false), true);
});
test('stations follow the heating, forging, tribute and purchasing tour', () => {
  assert.deepEqual(INTRO_DIALOGUE.map(page=>page.station), ['tribute','furnace','anvil','anvil','anvil','tribute','tribute','rack','relics','relics']);
});
