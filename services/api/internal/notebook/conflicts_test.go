package notebook

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

// serve runs handler behind the API's error mapping and returns the
// response a client would see.
func serve(t *testing.T, headers map[string]string, handler api.Handler) (int, map[string]any) {
	t.Helper()
	app := api.NewApp(
		api.NewRouter([]api.Route{{Method: "GET", Pattern: "/t", Auth: api.Public, Handler: handler}}),
		observability.NewLogger(io.Discard, "test"), observability.NewMetrics(io.Discard, "test", "test"), time.Now(),
	)
	if headers == nil {
		headers = map[string]string{}
	}
	res := app.Serve(context.Background(), &api.Request{Method: "GET", Headers: headers, Query: map[string]string{}, RequestID: "r"}, "/api/t", nil)
	var body map[string]any
	if err := json.Unmarshal(res.Body, &body); err != nil {
		t.Fatalf("body %q: %v", res.Body, err)
	}
	return res.Status, body
}

func errHandler(err error) api.Handler {
	return func(context.Context, *api.Request) (*api.Response, error) { return nil, err }
}

const (
	newNoteID    = "01JZ0000000000000000000010"
	winnerNoteID = "01JZ0000000000000000000011"
)

func newNote(id, typ string) Note {
	at := testNow.Format("2006-01-02T15:04:05.000Z")
	n := Note{
		ID: id, UserID: "u1", Area: "work", Type: typ, Title: "Plan",
		Tags: []string{}, TaskIDs: []string{}, Version: 1, CreatedAt: at, UpdatedAt: at,
	}
	if typ == "daily" {
		date := "2026-10-11"
		n.Date = &date
	}
	return n
}

// createFake answers TransactWriteItems from writes in order (the last
// repeats) and GetItem from rows by pk.
func createFake(writes []error, rows map[string]data.Item) *datatest.Fake {
	f := &datatest.Fake{}
	f.TransactWriteFn = func(*dynamodb.TransactWriteItemsInput) (*dynamodb.TransactWriteItemsOutput, error) {
		err := writes[min(f.Count("TransactWriteItems"), len(writes))-1]
		return &dynamodb.TransactWriteItemsOutput{}, err
	}
	f.GetItemFn = func(in *dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		return &dynamodb.GetItemOutput{Item: rows[attrS(in.Key["pk"])]}, nil
	}
	return f
}

func dailyClaimRow(holderID string) (string, data.Item) {
	key := dailyClaimKey("u1", "work", "2026-10-11")
	key["noteId"] = data.S(holderID)
	return attrS(key["pk"]), key
}

func TestCreateTransactionConflicts(t *testing.T) {
	conflict := datatest.Canceled("None", "TransactionConflict", "None")
	repo := newNotesRepo(nil, func() time.Time { return testNow })
	winner := newNote(winnerNoteID, "daily")
	tombstone := winner
	tombstone.Deleted = true
	claimPk, claim := dailyClaimRow(winnerNoteID)

	cases := []struct {
		name       string
		note       Note
		writes     []error
		rows       map[string]data.Item
		wantWrites int
		wantCode   api.ConflictCode // "" for success
	}{
		{
			name: "retries until the other transaction commits", note: newNote(newNoteID, "page"),
			writes: []error{conflict, conflict, nil}, wantWrites: 3,
		},
		{
			name: "gives up after four retries", note: newNote(newNoteID, "page"),
			writes: []error{conflict}, wantWrites: 5, wantCode: api.CodeConflict,
		},
		{
			name: "returns the daily note that won the claim", note: newNote(newNoteID, "daily"),
			writes:     []error{conflict},
			rows:       map[string]data.Item{claimPk: claim, keys.NotePk("u1", winnerNoteID): repo.base.storedItem(winner, nil, nil)},
			wantWrites: 1, wantCode: api.CodeDailyTaken,
		},
		{
			name: "a tombstone holding the claim doesn't stop the retry", note: newNote(newNoteID, "daily"),
			writes:     []error{conflict, nil},
			rows:       map[string]data.Item{claimPk: claim, keys.NotePk("u1", winnerNoteID): repo.base.storedItem(tombstone, nil, nil)},
			wantWrites: 2,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			waits := datatest.NoSleep(t)
			f := createFake(c.writes, c.rows)
			repo := newNotesRepo(fakeTable(f), func() time.Time { return testNow })

			got, err := repo.base.createIdempotent(context.Background(), c.note)
			if n := f.Count("TransactWriteItems"); n != c.wantWrites {
				t.Fatalf("%d transactions, want %d", n, c.wantWrites)
			}
			if len(*waits) != min(c.wantWrites-1, createRetries) {
				t.Fatalf("waits = %v, want one per retry", *waits)
			}
			for i, d := range *waits {
				if d >= 20*time.Millisecond<<i {
					t.Errorf("wait %d = %v, want under %v", i, d, 20*time.Millisecond<<i)
				}
			}
			if c.wantCode == "" {
				if err != nil || got.ID != newNoteID {
					t.Fatalf("got %+v, err %v; want the created note", got, err)
				}
				return
			}
			var ce *api.ConflictError
			if !errors.As(err, &ce) || ce.Code != c.wantCode {
				t.Fatalf("err = %v, want a %s conflict", err, c.wantCode)
			}
			if c.wantCode == api.CodeDailyTaken {
				if cur, ok := ce.Current.(Note); !ok || cur.ID != winnerNoteID || ce.CurrentVersion == nil {
					t.Fatalf("current = %#v, want the winning note so the client can merge", ce.Current)
				}
			}
		})
	}
}

func TestThrottledWritesAre503s(t *testing.T) {
	datatest.NoSleep(t)
	cases := map[string]func() error{
		"create": func() error {
			f := createFake([]error{datatest.Canceled("ThrottlingError", "None")}, nil)
			repo := newNotesRepo(fakeTable(f), func() time.Time { return testNow })
			_, err := repo.base.createIdempotent(context.Background(), newNote(newNoteID, "page"))
			if f.Count("TransactWriteItems") != 1 {
				t.Errorf("create: %d transactions, want no retry of a throttle", f.Count("TransactWriteItems"))
			}
			return err
		},
		"update": func() error {
			f := &fakeDynamo{putErr: &types.ProvisionedThroughputExceededException{}}
			repo := newNotesRepo(fakeTable(f), func() time.Time { return testNow })
			f.items = []data.Item{storedNote(repo, 3)}
			title := "Plan B"
			_, err := repo.update(context.Background(), "u1", "01JZ0000000000000000000001", api.Expected{Set: true, Version: 3}, noteFields{title: &title})
			return err
		},
	}
	for name, write := range cases {
		err := write()
		var unavailable *api.ServiceUnavailableError
		if !errors.As(err, &unavailable) {
			t.Fatalf("%s: err = %v, want ServiceUnavailableError", name, err)
		}
		if status, body := serve(t, nil, errHandler(err)); status != http.StatusServiceUnavailable || body["error"] != "service_unavailable" {
			t.Fatalf("%s: %d %v, want a 503", name, status, body)
		}
	}
}

func TestAssertClientVersion(t *testing.T) {
	header := contract.Data.Sync.ClientVersionHeader
	const floor = "2.3.4"
	cases := []struct {
		version string // "" sends no header
		status  int    // 0 for allowed
	}{
		{"", 0},
		{"2.3.4", 0},
		{" 2.3.4\n", 0},
		{"3.0.0", 0},
		{"2.4.0", 0},
		{"2.3.5", 0},
		{"10.0.0", 0},
		{"1.9.9", http.StatusUpgradeRequired},
		{"2.2.99", http.StatusUpgradeRequired},
		{"2.3.3", http.StatusUpgradeRequired},
		{"0.0.0", http.StatusUpgradeRequired},
		{"2.3", http.StatusBadRequest},
		{"v2.3.4", http.StatusBadRequest},
	}
	for _, c := range cases {
		headers := map[string]string{}
		if c.version != "" {
			headers[header] = c.version
		}
		r := &api.Request{Headers: headers}
		err := assertClientVersion(r, floor)
		if c.status == 0 {
			if err != nil {
				t.Errorf("%q: err = %v, want allowed", c.version, err)
			}
			continue
		}
		status, body := serve(t, headers, errHandler(err))
		if status != c.status {
			t.Errorf("%q: status %d, want %d (%v)", c.version, status, c.status, body)
			continue
		}
		if c.status == http.StatusUpgradeRequired {
			if body["error"] != "upgrade_required" || body["minClientVersion"] != floor ||
				!strings.Contains(fmt.Sprint(body["message"]), strings.TrimSpace(c.version)) {
				t.Errorf("%q: body %v, want upgrade_required with minClientVersion %s", c.version, body, floor)
			}
		}
	}

	if err := assertClientVersion(&api.Request{Headers: map[string]string{header: "1.0.0"}}, "bad"); err == nil {
		t.Error("a malformed floor must fail, not let every client through")
	}
	if err := assertClientVersion(&api.Request{Headers: map[string]string{header: "0.0.0"}}, contract.Data.Sync.MinClientVersion); err != nil {
		t.Errorf("contract floor %q: %v", contract.Data.Sync.MinClientVersion, err)
	}
}

func syncNoteRow(r *notesRepo, i int, body string) data.Item {
	at := testNow.Add(time.Duration(i) * time.Second).Format("2006-01-02T15:04:05.000Z")
	return r.base.storedItem(Note{
		ID: fmt.Sprintf("01JZ%022d", i), UserID: "u1", Area: "work", Type: "page", Title: "t", BodyMarkdown: body,
		Tags: []string{}, TaskIDs: []string{}, Version: 1, CreatedAt: at, UpdatedAt: at,
	}, nil, nil)
}

func readFeed(t *testing.T, table *data.Table, limit int) (pages [][]string, corrupt int) {
	t.Helper()
	q := syncQuery{limit: limit}
	for range 20 {
		page, err := changesSince(context.Background(), table, testNow.Add(time.Hour), "u1", q, func(*api.DataIntegrityError) { corrupt++ })
		if err != nil {
			t.Fatal(err)
		}
		var ids []string
		for _, c := range page.Changes {
			ids = append(ids, c.ID)
		}
		pages = append(pages, ids)
		if page.NextCursor == "" {
			return pages, corrupt
		}
		q.cursor = page.NextCursor
	}
	t.Fatal("feed never ended")
	return nil, 0
}

func TestSyncPagesStopAtTheByteBudget(t *testing.T) {
	f := &fakeDynamo{partitions: map[string][]data.Item{}}
	table := fakeTable(f)
	repo := newNotesRepo(table, time.Now)
	body := strings.Repeat("x", store.PageByteBudget*3/10)
	pk := keys.SyncPk("u1")
	for i := range 7 {
		f.partitions[pk] = append(f.partitions[pk], syncNoteRow(repo, i, body))
	}

	pages, _ := readFeed(t, table, 0)
	var all []string
	for i, p := range pages {
		if len(p) == 0 || len(p) > 3 {
			t.Fatalf("page %d has %d changes, want 1 to 3 under the byte budget", i, len(p))
		}
		all = append(all, p...)
	}
	var want []string
	for i := range 7 {
		want = append(want, fmt.Sprintf("01JZ%022d", i))
	}
	if !slices.Equal(all, want) {
		t.Fatalf("changes = %v, want each note once in feed order", all)
	}
}

// A cut on the first row of a later Query resumes at that Query's start
// key, not past the rows it returned.
func TestSyncByteBudgetCutOnALaterQuery(t *testing.T) {
	f := &fakeDynamo{partitions: map[string][]data.Item{}}
	table := fakeTable(f)
	repo := newNotesRepo(table, time.Now)
	body := strings.Repeat("x", store.PageByteBudget*4/10)
	pk := keys.SyncPk("u1")
	broken := syncNoteRow(repo, 0, "")
	broken["createdAt"] = data.S("not a date")
	f.partitions[pk] = []data.Item{broken, syncNoteRow(repo, 1, body), syncNoteRow(repo, 2, body), syncNoteRow(repo, 3, body)}

	pages, corrupt := readFeed(t, table, 3)
	want := [][]string{{"01JZ0000000000000000000001", "01JZ0000000000000000000002"}, {"01JZ0000000000000000000003"}}
	if fmt.Sprint(pages) != fmt.Sprint(want) || corrupt != 1 {
		t.Fatalf("pages = %v, corrupt = %d; want %v and the broken row logged once", pages, corrupt, want)
	}
}
