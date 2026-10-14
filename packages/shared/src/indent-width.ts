/** Leading spaces and tabs, each counted as one column. */
export const indentWidth = (text: string) => /^[ \t]*/.exec(text)![0].length;
