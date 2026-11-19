/*
 * A noun as a sentence writes it after its first word.
 *
 * **One spelling for every string that names an author's noun mid-sentence**,
 * on `docs/PATTERNS.md` §1's one-step tier: the Stat block's Edit press once
 * kept an acronym while every string beside it lowercased, so one sheet said
 * *Edit NPCs* above *Add npc* (`docs/features/stat-block-companion-face.md`,
 * The words). Its consumers are a Record set's and a Stat block's record noun
 * and a Stat block table zone's row word, which is why it knows nothing of
 * records and sits here rather than in `components/`.
 *
 * Pure text: no DOM, nothing from `obsidian`. A sentence that opens on the noun
 * (`${noun} added`) writes it as the author did and does not come here.
 */

/** Whether a noun is written in capitals throughout, `NPC`, and so keeps its case. */
export function isAcronym(noun: string): boolean {
	return noun.length > 1 && /\p{Lu}/u.test(noun) && noun === noun.toUpperCase();
}

/**
 * The noun as a sentence writes it after its first word: a noun in capitals
 * throughout keeps its case (*Add NPC*, *2 NPCs*) and any other is lowercased
 * (*Add feature*). Idempotent, so a caller holding the sentence form may pass
 * it on unchanged. A mixed-case noun (*Wild Shape*) still lowercases; whether
 * it should is open (`docs/SPEC.md` §13).
 */
export function nounInSentence(noun: string): string {
	return isAcronym(noun) ? noun : noun.toLowerCase();
}
