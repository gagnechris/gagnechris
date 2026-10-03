# Don't Feed the Bears 2.0 designs

Reference designs for the two bears games. The source is the "Public Site
Redesign" Claude design canvas, row "Don't Feed the Bears 2.0". Screenshots of
each artboard are attached to the Bears 2.0 issues in Linear; they are not
stored in this repo.

| Artboard                     | Size      | Shows                                                                                                    |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| Landing (pick a side)        | 1440×1180 | Site nav, "Vermont camp rules" kicker, two game cards (Camp Rules, Stay Wild), VT F&W link, skip to tips |
| Camp Rules (playable)        | 1440×900  | Dark HUD (time left, bear snacks, saves, score), campsite field, start card                              |
| Stay Wild level (desktop)    | 1280×720  | Level/timer, Winter fat bar, Too comfy with people paws, Sniff (S), pause, clapping camper, dog          |
| Stay Wild (phone, landscape) | 844×390   | Compact HUD, auto-run hint, Sniff (bottom left), Jump (bottom right)                                     |
| Stay Wild end                | 1280×720  | Den (win) and habituated variants: stats, bear tip, Play again, Now play as the camper                   |

[prototype-logic.md](prototype-logic.md) has the prototype code for Camp Rules
and Stay Wild.

## Camp Rules tuning (from the prototype)

All values are for a 60 s round; `p` is round progress from 0 to 1.

| Rule           | Value                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| Start          | Trash, cooler, and pet food out; first bear at 1.5 s, first guest at 2.5 s              |
| Guest interval | `4200 − 2000p` ms plus 0–1200 ms jitter; reopens a put-away item                        |
| Bear interval  | `3600 − 1800p` ms plus 0–800 ms jitter; spawns left or right, y 40–85                   |
| Bear speed     | `7 + 7p` units/s on a 0–100 field; reaches an item within 4 units                       |
| Snack          | Bear reaches an item: meter +1, item put away, bear leaves; 3 ends round                |
| Save           | Putting away an item a bear is heading for                                              |
| Score          | `seconds × 10 + saves × 25`                                                             |
| Paws           | `3 − snacks` (0 when habituated)                                                        |
| Make noise     | Tap a bear: it leaves; 6 s cooldown                                                     |
| Dusk           | Navy overlay, opacity `0.5p`                                                            |
| Item tiles     | 84 px; badges Out / Bear coming! / Put away                                             |
| End tip        | Item lost most often (cooler and grill share the campsite tip); none → never feed bears |

Guest toasts: "Someone set a trash bag down.", "A guest refilled the bird
feeder.", "The cooler got left open.", "Burgers are done. The grill is still
greasy.", "The dog's bowl is out on the porch."

## Stay Wild values (from the prototype)

| Item                     | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| Berries                  | +6% winter fat                                               |
| Beechnuts                | +4% winter fat                                               |
| Ants (revealed by Sniff) | +8% winter fat                                               |
| Campsite trash           | +15% winter fat and +1 Too comfy with people; 3 ends the run |
| Fat bar colour           | Gold below 70%, green at 70% and above                       |
