const colors = [
	'#c4a7ff',
	'#7dd3fc',
	'#6ee7b7',
	'#fcd34d',
	'#fda4af',
	'#fdba74',
	'#a5b4fc',
	'#f0abfc'
];

export function divisionColor(key: string) {
	const hash = [...key.slice(4)].reduce(
		(value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
		0
	);

	return colors[Math.abs(hash) % colors.length];
}
