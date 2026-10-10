package restoretest

import (
	"context"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

const table = "awsbackup-restore-test-abc123"

func validate(t *testing.T, items []Item, pageSize int, opts Options) (Result, *fakeScan) {
	t.Helper()
	scan := pagedScan(items, pageSize)
	result, err := newValidator(t).ValidateTable(context.Background(), scan.scan, table, opts)
	if err != nil {
		t.Fatal(err)
	}
	return result, scan
}

func modify(items []Item, match func(Item) bool, change func(Item)) []Item {
	for _, item := range items {
		if match(item) {
			change(item)
		}
	}
	return items
}

func ofType(entityType string) func(Item) bool {
	return func(i Item) bool { return i["entityType"] == entityType }
}

func TestEveryContractSampleIsValid(t *testing.T) {
	v := newValidator(t)
	for name, item := range contract.Data.Samples {
		if problem := v.CheckItem(item); problem != "" {
			t.Errorf("sample %s: %s", name, problem)
		}
	}
}

func TestValidatorCoversExactlyTheContractTypes(t *testing.T) {
	var ruled []string
	for entityType := range keyRules {
		ruled = append(ruled, entityType)
	}
	want := slices.Clone(contract.Data.RestoreTest.SchemaCheckedEntityTypes)
	slices.Sort(ruled)
	slices.Sort(want)
	if !slices.Equal(ruled, want) {
		t.Errorf("key rules for %v, contract checks %v", ruled, want)
	}
}

func TestPassesAHealthyRestoreAcrossScanPages(t *testing.T) {
	result, scan := validate(t, healthyItems(), 2, Options{})
	if result.Status != Successful || len(result.Problems) != 0 {
		t.Fatalf("result = %+v", result)
	}
	if result.ItemCount != 10 {
		t.Errorf("ItemCount = %d", result.ItemCount)
	}
	// home, resume, note, task, daily claim, project META + PUBLISHED
	if result.SchemaChecked != 7 {
		t.Errorf("SchemaChecked = %d", result.SchemaChecked)
	}
	if scan.calls != 5 {
		t.Errorf("scan calls = %d", scan.calls)
	}
	if !strings.HasPrefix(result.Message, "OK: 10 items") {
		t.Errorf("Message = %q", result.Message)
	}
}

func TestFailsAnEmptyTable(t *testing.T) {
	result, _ := validate(t, nil, 3, Options{})
	if result.Status != Failed || result.Problems[0] != "restored table is empty" {
		t.Errorf("result = %+v", result)
	}
}

func TestFailsWhenASingletonRowIsMissing(t *testing.T) {
	result, _ := validate(t, without(healthyItems(), "resume"), 3, Options{})
	if result.Status != Failed || !slices.Contains(result.Problems, "missing required row RESUME#current/META") {
		t.Errorf("result = %+v", result)
	}
}

func TestFailsACorruptNoteWithoutEchoingItsContent(t *testing.T) {
	items := modify(healthyItems(), ofType("note"), func(i Item) {
		i["version"] = "x"
		i["bodyMarkdown"] = 42.0
	})
	result, _ := validate(t, items, 3, Options{})
	if result.Status != Failed || !strings.Contains(result.Message, "note schema") {
		t.Errorf("result = %+v", result)
	}
	if strings.Contains(result.Message, "private text") {
		t.Errorf("message echoes note content: %q", result.Message)
	}
}

func TestFailsAnItemWhoseKeyDoesNotMatchTheKeyBuilders(t *testing.T) {
	items := modify(healthyItems(), ofType("task"), func(i Item) { i["pk"] = "USER#other#TASK#01TASK" })
	result, _ := validate(t, items, 3, Options{})
	want := []string{"USER#other#TASK#01TASK/META: task key does not match key builders"}
	if !slices.Equal(result.Problems, want) {
		t.Errorf("Problems = %q", result.Problems)
	}
}

func TestSchemaChecksProjects(t *testing.T) {
	isPublishedProject := func(i Item) bool { return i["entityType"] == "project" && i["sk"] == "PUBLISHED" }
	corrupt := modify(healthyItems(), isPublishedProject, func(i Item) { i["stage"] = "someday" })
	result, _ := validate(t, corrupt, 3, Options{})
	if want := []string{"PROJECT#01PROJECT/PUBLISHED: project schema (stage)"}; !slices.Equal(result.Problems, want) {
		t.Errorf("Problems = %q", result.Problems)
	}

	isProjectMeta := func(i Item) bool { return i["entityType"] == "project" && i["sk"] == "META" }
	moved := modify(healthyItems(), isProjectMeta, func(i Item) { i["pk"] = "PROJECT#other" })
	result, _ = validate(t, moved, 3, Options{})
	if want := []string{"PROJECT#other/META: project key does not match key builders"}; !slices.Equal(result.Problems, want) {
		t.Errorf("Problems = %q", result.Problems)
	}
}

func TestRefusesATableThatIsNotARestoreTestScratchTable(t *testing.T) {
	scan := pagedScan(healthyItems(), 3)
	result, err := newValidator(t).ValidateTable(context.Background(), scan.scan, "gagnechris-prod", Options{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != Failed || scan.calls != 0 {
		t.Errorf("result = %+v, scan calls = %d", result, scan.calls)
	}
}

func TestCapsTheScanAndTheMessageLength(t *testing.T) {
	many := make([]Item, 200)
	for n := range many {
		many[n] = Item{"pk": fmt.Sprintf("X#%d", n), "sk": 123.0}
	}
	result, _ := validate(t, many, 50, Options{MaxItems: 100})
	if result.ItemCount != 100 {
		t.Errorf("ItemCount = %d", result.ItemCount)
	}
	if !slices.Contains(result.Problems, "scan stopped after 100 items (maxItems)") {
		t.Errorf("Problems lack the cap: %q", result.Problems[len(result.Problems)-3:])
	}
	if n := utf8.RuneCountInString(result.Message); n > MaxMessageLength {
		t.Errorf("message has %d characters", n)
	}
	if !regexp.MustCompile(`\+\d+ more`).MatchString(result.Message) {
		t.Errorf("Message = %q", result.Message)
	}
}

// Sample rows are stamped sampleTS (2026-10-01T12:00Z); the restore point is later.
var (
	restorePoint = time.Date(2026, 10, 2, 7, 0, 0, 0, time.UTC)
	beforeRP     = "2026-10-02T06:00:00.000Z"
	afterRP      = "2026-10-02T08:00:00.000Z"
)

func floorOf(source []Item) (*CountFloor, *fakeCount) {
	count := &fakeCount{items: source}
	return &CountFloor{Count: count.count, SourceTable: "gagnechris-prod", RestorePoint: restorePoint}, count
}

func TestFloorFailsARestoreWithFewerNotesThanTheSource(t *testing.T) {
	floor, _ := floorOf(append(healthyItems(), notePagesAt(beforeRP, 2)...))
	result, _ := validate(t, healthyItems(), 3, Options{Floor: floor})
	if result.Status != Failed || len(result.Problems) != 1 ||
		!strings.HasPrefix(result.Problems[0], "note count 1 below floor 3 (3 in gagnechris-prod before ") {
		t.Errorf("Problems = %q", result.Problems)
	}
}

func TestFloorFailsARestoreThatLostEveryNote(t *testing.T) {
	floor, _ := floorOf(healthyItems())
	result, _ := validate(t, without(healthyItems(), "note"), 3, Options{Floor: floor})
	if result.Status != Failed || !strings.HasPrefix(result.Problems[0], "note count 0 below floor 1 ") {
		t.Errorf("Problems = %q", result.Problems)
	}
}

func TestFloorIgnoresRowsWrittenAfterTheRestorePoint(t *testing.T) {
	floor, _ := floorOf(append(healthyItems(), notePagesAt(afterRP, 5)...))
	result, _ := validate(t, healthyItems(), 3, Options{Floor: floor})
	if result.Status != Successful || !strings.Contains(result.Message, "counts at floor") {
		t.Errorf("result = %+v", result)
	}
}

func TestFloorAllowsATenPercentShortfallOnLargerTypesOnly(t *testing.T) {
	floor, _ := floorOf(append(healthyItems(), notePagesAt(beforeRP, 19)...))
	result, _ := validate(t, append(healthyItems(), notePagesAt(beforeRP, 17)...), 3, Options{Floor: floor})
	if result.Status != Successful {
		t.Errorf("result = %+v", result)
	}
	var got []int
	for _, n := range []int{0, 1, 2, 3, 10, 20} {
		got = append(got, MinRestoredCount(n))
	}
	if want := []int{0, 1, 2, 3, 9, 18}; !slices.Equal(got, want) {
		t.Errorf("MinRestoredCount = %v", got)
	}
}

func TestFloorPassesANearEmptySource(t *testing.T) {
	singletons := []Item{contract.Sample("home"), contract.Sample("resume")}
	floor, _ := floorOf(singletons)
	result, _ := validate(t, singletons, 3, Options{Floor: floor})
	if result.Status != Successful {
		t.Errorf("result = %+v", result)
	}
}

func TestFloorCountsTheSourceOnMetadataAttributesOnly(t *testing.T) {
	floor, count := floorOf(healthyItems())
	validate(t, healthyItems(), 3, Options{Floor: floor})
	if len(count.calls) == 0 {
		t.Fatal("no COUNT scans")
	}
	allowed := contract.Data.RestoreTest.SourceCountAttributes
	types := map[string]bool{}
	for _, call := range count.calls {
		if call.TableName != "gagnechris-prod" {
			t.Errorf("TableName = %q", call.TableName)
		}
		for _, name := range call.ExpressionAttributeNames {
			if !slices.Contains(allowed, name) {
				t.Errorf("attribute %q is outside the IAM allow-list %v", name, allowed)
			}
		}
		types[call.ExpressionAttributeValues[":t"]] = true
	}
	for _, entityType := range contract.Data.RestoreTest.CountFloorEntityTypes {
		if !types[entityType] {
			t.Errorf("%s not counted", entityType)
		}
	}
	if len(types) != len(contract.Data.RestoreTest.CountFloorEntityTypes) {
		t.Errorf("counted %v", types)
	}
	// Settle margin: 5 min before the restore point.
	if cut := count.calls[0].ExpressionAttributeValues[":cut"]; cut != "2026-10-02T06:55:00.000Z" {
		t.Errorf(":cut = %q", cut)
	}
}

func TestFloorIsSkippedWhenTheScanWasTruncated(t *testing.T) {
	floor, count := floorOf(healthyItems())
	result, _ := validate(t, healthyItems(), 2, Options{MaxItems: 2, Floor: floor})
	if result.Status != Failed || len(count.calls) != 0 {
		t.Errorf("result = %+v, count calls = %d", result, len(count.calls))
	}
}

func TestFloorsEverySchemaCheckedTypeThatHasATimestamp(t *testing.T) {
	if sampleTS >= restorePoint.Format(time.RFC3339) {
		t.Fatal("samples must predate the restore point")
	}
	var unfloored []string
	for _, entityType := range contract.Data.RestoreTest.SchemaCheckedEntityTypes {
		if !slices.Contains(contract.Data.RestoreTest.CountFloorEntityTypes, entityType) {
			unfloored = append(unfloored, entityType)
		}
	}
	if !slices.Equal(unfloored, []string{"dailyNoteClaim"}) {
		t.Errorf("unfloored = %v", unfloored)
	}
}

func TestCheckItemFlagsMissingKeys(t *testing.T) {
	v := newValidator(t)
	for _, c := range []struct {
		item Item
		want string
	}{
		{Item{"sk": "META"}, "item without a string pk"},
		{Item{"pk": "A"}, "A: missing string sk"},
		{Item{"pk": "A", "sk": "B", "entityType": "unknown"}, ""},
	} {
		if got := v.CheckItem(c.item); got != c.want {
			t.Errorf("CheckItem(%v) = %q, want %q", c.item, got, c.want)
		}
	}
}

func TestCheckItemAcceptsPostsWithOrWithoutProjectIDs(t *testing.T) {
	v := newValidator(t)
	if got := v.CheckItem(contract.Sample("postTagged")); got != "" {
		t.Errorf("tagged: %s", got)
	}
	if got := v.CheckItem(contract.Sample("postUntagged")); got != "" {
		t.Errorf("untagged: %s", got)
	}
	bad := contract.Sample("postTagged")
	bad["projectIds"] = "01PROJECT"
	if got, want := v.CheckItem(bad), "POST#01POST/PUBLISHED: post schema (projectIds)"; got != want {
		t.Errorf("CheckItem = %q, want %q", got, want)
	}
}

func TestTableNamesFromArnsAndScratchNames(t *testing.T) {
	if got := TableNameFromArn("arn:aws:dynamodb:us-east-1:111111111111:table/awsbackup-restore-test-x"); got != "awsbackup-restore-test-x" {
		t.Errorf("TableNameFromArn = %q", got)
	}
	if TableNameFromArn("") != "" || TableNameFromArn("arn:aws:s3:::bucket") != "" {
		t.Error("non-table ARNs must give no table")
	}
	if IsRestoreTestTableName("awsbackup-restore-test-") || IsRestoreTestTableName("gagnechris-prod") {
		t.Error("not restore-test tables")
	}
}

func TestResumeRowsAcrossTheDateMigration(t *testing.T) {
	for _, c := range []struct{ label, meta, published string }{
		{"old shape (dates inside company)", "resumeLegacy", "resumeLegacyPublished"},
		{"structured start/end, headline and cut-off", "resume", "resumePublished"},
	} {
		items := append(without(healthyItems(), "resume"), contract.Sample(c.meta), contract.Sample(c.published))
		result, _ := validate(t, items, 3, Options{})
		if result.Status != Successful {
			t.Errorf("%s: %q", c.label, result.Problems)
		}
	}

	resume := contract.Sample("resume")
	content := resume["content"].(map[string]any)
	content["experience"].([]any)[0].(map[string]any)["start"] = "July 2019"
	items := append(without(healthyItems(), "resume"), resume)
	if result, _ := validate(t, items, 3, Options{}); result.Status != Failed {
		t.Error("a malformed start month passed")
	}
}
