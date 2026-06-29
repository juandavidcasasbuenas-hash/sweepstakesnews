import assert from "node:assert/strict";
import test from "node:test";
import { avatarForName } from "@/lib/avatars";

test("keeps avatars when display names add a real name in parentheses", () => {
  assert.equal(avatarForName("Luke martinelli (Luke)"), "/avatars/luke-martinelli.png");
  assert.equal(avatarForName("No era penal (Diego)"), "/avatars/no-era-penal.png");
  assert.equal(avatarForName("Aston La Vista Bab (Hannah)"), "/avatars/aston-la-vista-bab.png");
  assert.equal(avatarForName("Herman ze German (Ben)"), "/avatars/herman-ze-german.png");
  assert.equal(avatarForName("King of the humpers (Mike)"), "/avatars/king-of-the-humpers.png");
  assert.equal(avatarForName("Humpers the king (Humfrey)"), "/avatars/humpers-the-king.png");
  assert.equal(avatarForName("Bring back the waistcoat (Shelui)"), "/avatars/bring-back-the-waistcoat.png");
  assert.equal(avatarForName("Wendy renard (Chloe)"), "/avatars/wendy-renard.png");
  assert.equal(avatarForName("Beth (Bethany)"), "/avatars/beth.png");
});

