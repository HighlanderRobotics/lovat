declare module 'virtual:lovat-changelog' {
	const months: {
		title: string;
		id: string;
		year: string;
		html: string;
		features: { title: string; id: string; html: string }[];
	}[];
	export default months;
}
