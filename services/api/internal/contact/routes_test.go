package contact

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

// fakeBackend keeps one shared daily mail count, as the data table does.
type fakeBackend struct {
	mailCount int
	statuses  []string
}

func (f *fakeBackend) consumeContactIP(context.Context, string) (bool, error) { return true, nil }

func (f *fakeBackend) save(context.Context, string, string, string, string) (string, error) {
	return "C1", nil
}

func (f *fakeBackend) consume(limit int) bool {
	if f.mailCount >= limit {
		return false
	}
	f.mailCount++
	return true
}

func (f *fakeBackend) consumeSESSend(context.Context) (bool, error) {
	return f.consume(contract.Data.API.SESGlobalDailyCap), nil
}

func (f *fakeBackend) consumeResumeSESSend(context.Context) (bool, error) {
	return f.consume(contract.Data.API.ResumeNotifySESDailyCap), nil
}

func (f *fakeBackend) claimResumeNotifyIP(context.Context, string) (bool, error) { return true, nil }

func (f *fakeBackend) updateEmailStatus(_ context.Context, _, status, _ string) error {
	f.statuses = append(f.statuses, status)
	return nil
}

type fakeMailer struct {
	err  error
	sent int
}

func (m *fakeMailer) Send(context.Context, Mail) error {
	m.sent++
	return m.err
}

type recorded struct {
	logs, emf bytes.Buffer
}

func (rec *recorded) request(t *testing.T, body string) *api.Request {
	t.Helper()
	return &api.Request{
		Body:     []byte(body),
		Headers:  map[string]string{},
		SourceIP: "203.0.113.7",
		Log:      observability.NewLogger(&rec.logs, "test"),
		Metrics:  observability.NewMetrics(&rec.emf, "test", "test"),
	}
}

const contactBody = `{"name":"Ada","email":"ada@example.com","message":"Hi","elapsedMs":5000}`

func newHandlers(b *fakeBackend, m *fakeMailer) handlers {
	return handlers{store: b, mail: m, now: time.Now}
}

func emitted(t *testing.T, r *api.Request, rec *recorded) string {
	t.Helper()
	if err := r.Metrics.Flush(); err != nil {
		t.Fatal(err)
	}
	return rec.emf.String()
}

func TestContactSendFailureLogsAndCounts(t *testing.T) {
	var rec recorded
	r := rec.request(t, contactBody)
	b := &fakeBackend{}
	res, err := newHandlers(b, &fakeMailer{err: errors.New("ses down")}).contact(context.Background(), r)
	if err != nil || res.Status != 502 {
		t.Fatalf("got %v, %v; want 502", res, err)
	}
	if !strings.Contains(rec.logs.String(), "Contact email failed") || !strings.Contains(rec.logs.String(), "ses down") {
		t.Errorf("no failure log: %s", rec.logs.String())
	}
	if !strings.Contains(emitted(t, r, &rec), `"ContactEmailFailed"`) {
		t.Errorf("no ContactEmailFailed metric: %s", rec.emf.String())
	}
	if len(b.statuses) != 1 || b.statuses[0] != "failed" {
		t.Errorf("statuses = %v", b.statuses)
	}
}

func TestContactAtTheDailyCapCounts(t *testing.T) {
	var rec recorded
	r := rec.request(t, contactBody)
	b := &fakeBackend{mailCount: contract.Data.API.SESGlobalDailyCap}
	m := &fakeMailer{}
	_, err := newHandlers(b, m).contact(context.Background(), r)
	var limited *api.RateLimitedError
	if !errors.As(err, &limited) {
		t.Fatalf("err = %v, want rate limited", err)
	}
	if m.sent != 0 {
		t.Errorf("sent %d mails over the cap", m.sent)
	}
	if !strings.Contains(emitted(t, r, &rec), `"SesCapReached"`) {
		t.Errorf("no SesCapReached metric: %s", rec.emf.String())
	}
	if !strings.Contains(rec.logs.String(), "Daily email cap reached") {
		t.Errorf("no cap log: %s", rec.logs.String())
	}
}

func TestResumeNoticesLeaveTheContactBudget(t *testing.T) {
	b := &fakeBackend{}
	m := &fakeMailer{}
	h := newHandlers(b, m)
	for range contract.Data.API.SESGlobalDailyCap {
		var rec recorded
		if _, err := h.resumeDownload(context.Background(), rec.request(t, `{}`)); err != nil {
			t.Fatal(err)
		}
	}
	resumeSent := m.sent
	if resumeSent != contract.Data.API.ResumeNotifySESDailyCap {
		t.Fatalf("resume notices sent = %d, want %d", resumeSent, contract.Data.API.ResumeNotifySESDailyCap)
	}

	for i := range contract.Data.API.SESGlobalDailyCap - resumeSent {
		var rec recorded
		res, err := h.contact(context.Background(), rec.request(t, contactBody))
		if err != nil || res.Status != 200 {
			t.Fatalf("contact %d after resume notices: %v, %v", i, res, err)
		}
	}
}

func TestResumeNotifyFailureIsLogged(t *testing.T) {
	var rec recorded
	res, err := newHandlers(&fakeBackend{}, &fakeMailer{err: errors.New("ses down")}).
		resumeDownload(context.Background(), rec.request(t, `{}`))
	if err != nil || res.Status != 200 {
		t.Fatalf("got %v, %v; want 200", res, err)
	}
	if !strings.Contains(rec.logs.String(), "Resume download email failed") || !strings.Contains(rec.logs.String(), "ses down") {
		t.Errorf("no failure log: %s", rec.logs.String())
	}
}
