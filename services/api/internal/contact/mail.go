package contact

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

// Mail goes to the site owner; the handlers set From and To from Config.
type Mail struct {
	From    string
	To      string
	Subject string
	Text    string
	ReplyTo string
}

type Mailer interface {
	Send(ctx context.Context, m Mail) error
}

type SESMailer struct{ Client *sesv2.Client }

func (s SESMailer) Send(ctx context.Context, m Mail) error {
	in := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(m.From),
		Destination:      &types.Destination{ToAddresses: []string{m.To}},
		Content: &types.EmailContent{Simple: &types.Message{
			Subject: &types.Content{Data: aws.String(m.Subject), Charset: aws.String("UTF-8")},
			Body:    &types.Body{Text: &types.Content{Data: aws.String(m.Text), Charset: aws.String("UTF-8")}},
		}},
	}
	if m.ReplyTo != "" {
		in.ReplyToAddresses = []string{m.ReplyTo}
	}
	_, err := s.Client.SendEmail(ctx, in)
	return err
}

// Outbox stands in for SES outside Lambda: each message is logged and, when
// File is set, appended to it as one JSON line, which the HTTP suite and
// e2e tests read.
type Outbox struct {
	File string
	Log  *slog.Logger
	mu   sync.Mutex
}

func (o *Outbox) Send(_ context.Context, m Mail) error {
	o.Log.Info("outbox", "subject", m.Subject)
	if o.File == "" {
		return nil
	}
	replyTo := []string{}
	if m.ReplyTo != "" {
		replyTo = []string{m.ReplyTo}
	}
	line, err := json.Marshal(map[string]any{
		"from": m.From, "to": []string{m.To}, "replyTo": replyTo, "subject": m.Subject, "text": m.Text,
	})
	if err != nil {
		return err
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	f, err := os.OpenFile(o.File, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(line, '\n')); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}
