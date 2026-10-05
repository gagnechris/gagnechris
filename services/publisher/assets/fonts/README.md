# Resume PDF fonts

The publisher embeds these with `@pdf-lib/fontkit` (subset per PDF), so resume
PDFs support Unicode beyond WinAnsi. The CDK bundle copies every `*.ttf` and
`*-OFL.txt` here into the Lambda.

| File                         | Source                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inter-Regular.ttf`, `-Bold` | Inter 4.1, [`rsms/inter`](https://github.com/rsms/inter) `extras/ttf`                                                                                                                                                |
| `Newsreader16pt-*.ttf`       | Newsreader 1.003 static 16pt cut (Regular, Italic, Medium), [`productiontype/Newsreader`](https://github.com/productiontype/Newsreader/tree/cfcb4f7af0e52c25e8df2a2431814c8e5fe2e155/fonts/static/ttf) at `cfcb4f7a` |

License: SIL Open Font License 1.1 — see `Inter-OFL.txt` and `Newsreader-OFL.txt`.
