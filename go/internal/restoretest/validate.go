// Package restoretest validates AWS Backup restore-test tables and checks
// that backups and restore tests are still happening. It never logs or
// reports item content, only keys and issue paths.
package restoretest

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/keys"
)

const (
	DefaultMaxScanItems = 50_000
	MaxMessageLength    = 900
	maxListedProblems   = 10

	CountFloorFraction = 0.9
	// Covers API writes whose timestamp is stamped before they commit.
	CountFloorSettle = 5 * time.Minute
)

type Item = map[string]any

// StartKey is an opaque pagination token; nil means no more pages.
type StartKey any

type ScanInput struct {
	TableName         string
	ExclusiveStartKey StartKey
}

type ScanPage struct {
	Items            []Item
	LastEvaluatedKey StartKey
}

type ScanFunc func(ctx context.Context, in ScanInput) (ScanPage, error)

type CountInput struct {
	TableName                 string
	FilterExpression          string
	ExpressionAttributeNames  map[string]string
	ExpressionAttributeValues map[string]string
	ExclusiveStartKey         StartKey
}

type CountPage struct {
	Count            int
	LastEvaluatedKey StartKey
}

// CountFunc runs a Select COUNT scan.
type CountFunc func(ctx context.Context, in CountInput) (CountPage, error)

type Status string

const (
	Successful Status = "SUCCESSFUL"
	Failed     Status = "FAILED"
)

type Result struct {
	Status        Status   `json:"status"`
	Message       string   `json:"message"`
	ItemCount     int      `json:"itemCount"`
	SchemaChecked int      `json:"schemaChecked"`
	Problems      []string `json:"problems"`
	FloorChecked  bool     `json:"floorChecked,omitempty"`
}

type CountFloor struct {
	Count        CountFunc
	SourceTable  string
	RestorePoint time.Time
}

type Options struct {
	MaxItems int
	Floor    *CountFloor
}

type entityRule struct {
	schema     *jsonschema.Schema
	keyMatches func(Item) bool
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func isMetaOrPublished(sk any) bool {
	return sk == keys.SKMeta || sk == keys.SKPublished
}

var keyRules = map[string]func(Item) bool{
	"post": func(i Item) bool {
		return i["pk"] == keys.PostPk(str(i["postId"])) && isMetaOrPublished(i["sk"])
	},
	"project": func(i Item) bool {
		return i["pk"] == keys.ProjectPk(str(i["projectId"])) && isMetaOrPublished(i["sk"])
	},
	"home": func(i Item) bool {
		return i["pk"] == keys.HomePk() && isMetaOrPublished(i["sk"])
	},
	"removedUser": func(i Item) bool {
		return i["pk"] == keys.RemovedUsersPk() && i["sk"] == keys.RemovedUserSk(str(i["userId"]))
	},
	"resume": func(i Item) bool {
		return i["pk"] == keys.ResumePk() && isMetaOrPublished(i["sk"])
	},
	"contact": func(i Item) bool {
		return i["pk"] == keys.ContactPk(str(i["contactId"])) && i["sk"] == keys.ContactMsgSk()
	},
	"note": func(i Item) bool {
		return i["pk"] == keys.NotePk(str(i["userId"]), str(i["id"])) && i["sk"] == keys.NoteMetaSk()
	},
	"task": func(i Item) bool {
		return i["pk"] == keys.TaskPk(str(i["userId"]), str(i["id"])) && i["sk"] == keys.TaskMetaSk()
	},
	"dailyNoteClaim": func(i Item) bool {
		return i["pk"] == keys.DailyNoteClaimPk(str(i["userId"]), str(i["area"]), str(i["date"])) &&
			i["sk"] == keys.DailyNoteClaimSk()
	},
	"dailyTemplate": func(i Item) bool {
		return i["pk"] == keys.DailyTemplatePk(str(i["userId"]), str(i["area"])) &&
			i["sk"] == keys.DailyTemplateSk()
	},
}

var requiredKeys = []string{
	keys.HomePk() + "/" + keys.SKMeta,
	keys.ResumePk() + "/" + keys.SKMeta,
}

// Validator checks restored rows against the item schemas and key formats
// in the generated contract.
type Validator struct {
	rules map[string]entityRule
}

func NewValidator() (*Validator, error) {
	compiler := jsonschema.NewCompiler()
	compiler.AssertFormat()
	rules := map[string]entityRule{}
	for _, entityType := range contract.Data.RestoreTest.SchemaCheckedEntityTypes {
		raw, ok := contract.Data.ItemSchemas[entityType]
		if !ok {
			return nil, fmt.Errorf("no item schema for %s", entityType)
		}
		keyMatches, ok := keyRules[entityType]
		if !ok {
			return nil, fmt.Errorf("no key rule for %s", entityType)
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		url := "contract:///items/" + entityType + ".json"
		if err := compiler.AddResource(url, doc); err != nil {
			return nil, err
		}
		schema, err := compiler.Compile(url)
		if err != nil {
			return nil, fmt.Errorf("compile %s item schema: %w", entityType, err)
		}
		rules[entityType] = entityRule{schema: schema, keyMatches: keyMatches}
	}
	return &Validator{rules: rules}, nil
}

func keyLabel(item Item) string {
	pk, sk := str(item["pk"]), str(item["sk"])
	if pk == "" {
		pk = "?"
	}
	if sk == "" {
		sk = "?"
	}
	return pk + "/" + sk
}

// CheckItem returns the problem with one row, or "" when it is fine.
func (v *Validator) CheckItem(item Item) string {
	pk := str(item["pk"])
	if pk == "" {
		return "item without a string pk"
	}
	if str(item["sk"]) == "" {
		return pk + ": missing string sk"
	}
	entityType := str(item["entityType"])
	rule, ok := v.rules[entityType]
	if !ok {
		return ""
	}
	if err := rule.schema.Validate(item); err != nil {
		// Issue paths only: values may be private note text.
		return fmt.Sprintf("%s: %s schema (%s)", keyLabel(item), entityType, issuePaths(err, 3))
	}
	if !rule.keyMatches(item) {
		return fmt.Sprintf("%s: %s key does not match key builders", keyLabel(item), entityType)
	}
	return ""
}

func (v *Validator) isSchemaChecked(item Item) bool {
	_, ok := v.rules[str(item["entityType"])]
	return ok
}

func issuePaths(err error, limit int) string {
	var verr *jsonschema.ValidationError
	if !errors.As(err, &verr) {
		return "(root)"
	}
	var paths []string
	seen := map[string]bool{}
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(paths) == limit {
			return
		}
		if len(e.Causes) == 0 {
			path := strings.Join(e.InstanceLocation, ".")
			if path == "" {
				path = "(root)"
			}
			if !seen[path] {
				seen[path] = true
				paths = append(paths, path)
			}
			return
		}
		for _, cause := range e.Causes {
			walk(cause)
		}
	}
	walk(verr)
	return strings.Join(paths, ",")
}

func IsRestoreTestTableName(name string) bool {
	prefix := contract.Data.RestoreTest.TablePrefix
	return strings.HasPrefix(name, prefix) && len(name) > len(prefix)
}

var tableArn = regexp.MustCompile(`:table/([^/]+)$`)

// TableNameFromArn returns "" when the ARN is not a DynamoDB table's.
func TableNameFromArn(arn string) string {
	if m := tableArn.FindStringSubmatch(arn); m != nil {
		return m[1]
	}
	return ""
}

func MinRestoredCount(existedAtRestorePoint int) int {
	return int(math.Ceil(float64(existedAtRestorePoint) * CountFloorFraction))
}

func isoMillis(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func countSourceRowsExistingAt(ctx context.Context, count CountFunc, sourceTable, entityType, cutoff string) (int, error) {
	total := 0
	var start StartKey
	for {
		page, err := count(ctx, CountInput{
			TableName: sourceTable,
			// A row written at or before the cutoff existed at the restore point.
			FilterExpression:          "#t = :t AND (#c <= :cut OR #u <= :cut)",
			ExpressionAttributeNames:  map[string]string{"#t": "entityType", "#c": "createdAt", "#u": "updatedAt"},
			ExpressionAttributeValues: map[string]string{":t": entityType, ":cut": cutoff},
			ExclusiveStartKey:         start,
		})
		if err != nil {
			return 0, err
		}
		total += page.Count
		if page.LastEvaluatedKey == nil {
			return total, nil
		}
		start = page.LastEvaluatedKey
	}
}

func countFloorProblems(ctx context.Context, floor *CountFloor, restoredByType map[string]int) ([]string, error) {
	cutoff := isoMillis(floor.RestorePoint.Add(-CountFloorSettle))
	var problems []string
	for _, entityType := range contract.Data.RestoreTest.CountFloorEntityTypes {
		existed, err := countSourceRowsExistingAt(ctx, floor.Count, floor.SourceTable, entityType, cutoff)
		if err != nil {
			return nil, err
		}
		restored := restoredByType[entityType]
		if minimum := MinRestoredCount(existed); restored < minimum {
			problems = append(problems, fmt.Sprintf(
				"%s count %d below floor %d (%d in %s before %s)",
				entityType, restored, minimum, existed, floor.SourceTable, cutoff,
			))
		}
	}
	return problems, nil
}

// Finalize sets the status and message from the problems found.
func Finalize(r Result) Result {
	r.Status = Successful
	if len(r.Problems) > 0 {
		r.Status = Failed
	}
	r.Message = buildMessage(r)
	return r
}

func buildMessage(r Result) string {
	var head string
	if r.Status == Successful {
		head = fmt.Sprintf("OK: %d items, %d schema-checked, singletons present", r.ItemCount, r.SchemaChecked)
		if r.FloorChecked {
			head += ", counts at floor"
		}
	} else {
		head = fmt.Sprintf("FAILED: %d problem(s) in %d items", len(r.Problems), r.ItemCount)
	}
	if len(r.Problems) == 0 {
		return head
	}
	listed := r.Problems
	more := ""
	if len(listed) > maxListedProblems {
		more = fmt.Sprintf("; +%d more", len(listed)-maxListedProblems)
		listed = listed[:maxListedProblems]
	}
	message := head + ": " + strings.Join(listed, "; ") + more
	if utf8.RuneCountInString(message) > MaxMessageLength {
		message = string([]rune(message)[:MaxMessageLength-1]) + "…"
	}
	return message
}

// ValidateTable scans a restore-test table and checks every row. Errors from
// scan or count are returned for the caller to report as a failed test.
func (v *Validator) ValidateTable(ctx context.Context, scan ScanFunc, tableName string, opts Options) (Result, error) {
	if !IsRestoreTestTableName(tableName) {
		return Finalize(Result{Problems: []string{fmt.Sprintf(
			`refusing to validate %q: not an %s* table`, tableName, contract.Data.RestoreTest.TablePrefix,
		)}}), nil
	}
	maxItems := opts.MaxItems
	if maxItems == 0 {
		maxItems = DefaultMaxScanItems
	}
	var r Result
	required := map[string]bool{}
	for _, k := range requiredKeys {
		required[k] = false
	}
	restoredByType := map[string]int{}
	var start StartKey
	for {
		page, err := scan(ctx, ScanInput{TableName: tableName, ExclusiveStartKey: start})
		if err != nil {
			return Result{}, err
		}
		for _, item := range page.Items {
			r.ItemCount++
			if v.isSchemaChecked(item) {
				r.SchemaChecked++
			}
			restoredByType[str(item["entityType"])]++
			if problem := v.CheckItem(item); problem != "" {
				r.Problems = append(r.Problems, problem)
			}
			if _, ok := required[keyLabel(item)]; ok {
				required[keyLabel(item)] = true
			}
		}
		start = page.LastEvaluatedKey
		if start == nil || r.ItemCount >= maxItems {
			break
		}
	}

	truncated := start != nil
	if truncated {
		r.Problems = append(r.Problems, fmt.Sprintf("scan stopped after %d items (maxItems)", r.ItemCount))
	}
	if r.ItemCount == 0 {
		r.Problems = append([]string{"restored table is empty"}, r.Problems...)
	}
	for _, k := range requiredKeys {
		if !required[k] {
			r.Problems = append(r.Problems, "missing required row "+k)
		}
	}
	// A truncated scan undercounts every type; its own problem is enough.
	if opts.Floor != nil && !truncated {
		problems, err := countFloorProblems(ctx, opts.Floor, restoredByType)
		if err != nil {
			return Result{}, err
		}
		r.Problems = append(r.Problems, problems...)
		r.FloorChecked = true
	}
	return Finalize(r), nil
}
