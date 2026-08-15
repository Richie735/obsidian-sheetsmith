/** Split text into lines, each keeping its own line ending. */
export function splitLines(text: string): string[] {
	const lines: string[] = [];
	let start = 0;
	let index;
	while ((index = text.indexOf('\n', start)) !== -1) {
		lines.push(text.slice(start, index + 1));
		start = index + 1;
	}
	if (start < text.length) lines.push(text.slice(start));
	return lines;
}

/** A line without its trailing line ending. */
export function lineText(line: string): string {
	return line.endsWith('\r\n')
		? line.slice(0, -2)
		: line.endsWith('\n')
			? line.slice(0, -1)
			: line;
}
