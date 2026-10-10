package apitypes

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

// roundTrip decodes body into a T, rejecting fields T lacks, and checks that
// encoding it again gives the same JSON.
func roundTrip[T any](t *testing.T, body json.RawMessage) T {
	t.Helper()
	var v T
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	out, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	assertSameJSON(t, body, out)
	return v
}

func assertSameJSON(t *testing.T, want, got []byte) {
	t.Helper()
	var w, g any
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(got, &g); err != nil {
		t.Fatal(err)
	}
	wb, _ := json.Marshal(w)
	gb, _ := json.Marshal(g)
	if !bytes.Equal(wb, gb) {
		t.Errorf("round trip changed the body\nwant %s\n got %s", wb, gb)
	}
}

func sample(t *testing.T, name string) json.RawMessage {
	t.Helper()
	body, ok := contract.Data.APISamples[name]
	if !ok {
		t.Fatalf("no api sample %s", name)
	}
	return body
}

func TestEntitiesRoundTrip(t *testing.T) {
	cases := map[string]func(*testing.T, json.RawMessage){
		"post":    func(t *testing.T, b json.RawMessage) { roundTrip[Post](t, b) },
		"project": func(t *testing.T, b json.RawMessage) { roundTrip[Project](t, b) },
		"home":    func(t *testing.T, b json.RawMessage) { roundTrip[Home](t, b) },
		"resume":  func(t *testing.T, b json.RawMessage) { roundTrip[Resume](t, b) },
		"note":    func(t *testing.T, b json.RawMessage) { roundTrip[Note](t, b) },
		"task":    func(t *testing.T, b json.RawMessage) { roundTrip[Task](t, b) },
	}
	for name, check := range cases {
		t.Run(name, func(t *testing.T) { check(t, sample(t, name)) })
	}
}

func TestSyncChangeVariants(t *testing.T) {
	t.Run("note", func(t *testing.T) {
		change := roundTrip[SyncChange](t, sample(t, "syncNote"))
		v, err := change.ValueByDiscriminator()
		if err != nil {
			t.Fatal(err)
		}
		live, err := v.(NoteSyncChange).AsNoteSyncChange0()
		if err != nil {
			t.Fatal(err)
		}
		if live.Deleted || live.Entity.ID != live.ID {
			t.Errorf("live note change decoded as %+v", live)
		}
	})
	t.Run("task", func(t *testing.T) {
		change := roundTrip[SyncChange](t, sample(t, "syncTask"))
		v, err := change.ValueByDiscriminator()
		if err != nil {
			t.Fatal(err)
		}
		live, err := v.(TaskSyncChange).AsTaskSyncChange0()
		if err != nil {
			t.Fatal(err)
		}
		if live.Deleted || live.Entity.ID != live.ID {
			t.Errorf("live task change decoded as %+v", live)
		}
	})
	t.Run("task deleted", func(t *testing.T) {
		change := roundTrip[SyncChange](t, sample(t, "syncTaskDeleted"))
		task, err := change.AsTaskSyncChange()
		if err != nil {
			t.Fatal(err)
		}
		gone, err := task.AsTaskSyncChange1()
		if err != nil {
			t.Fatal(err)
		}
		if !gone.Deleted {
			t.Error("deleted change decoded as live")
		}
	})
}

func TestSyncChangesResponseRoundTrip(t *testing.T) {
	body, err := json.Marshal(map[string]any{
		"changes": []json.RawMessage{
			sample(t, "syncNote"),
			sample(t, "syncTask"),
			sample(t, "syncTaskDeleted"),
		},
		"nextSince": "2026-10-01T12:00:00.000Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	roundTrip[SyncChangesResponse](t, body)
}
