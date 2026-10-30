// Package claude calls Claude through the Messages API on Amazon Bedrock,
// signed with the function's IAM role.
package claude

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/bedrock"
	"github.com/anthropics/anthropic-sdk-go/v2/lib/betafallback"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

const (
	Model = "anthropic.claude-opus-5-5"
	// FallbackModel answers when Model's safety classifiers decline: work
	// notes about security reviews can trip them.
	FallbackModel = "anthropic.claude-opus-4-8"
	maxTokens     = 16000
	// Under the recap function's timeout, so a slow call still lets it
	// write the failure into the note.
	requestTimeout = 4 * time.Minute
)

type Writer struct {
	messages anthropic.BetaMessageService
}

func NewWriter(ctx context.Context, region string) (*Writer, error) {
	client, err := bedrock.NewMantleClient(ctx, bedrock.MantleClientConfig{AWSRegion: region},
		option.WithMiddleware(betafallback.BetaRefusalFallbackMiddleware(
			[]anthropic.BetaFallbackParam{{Model: FallbackModel}},
		)),
		option.WithRequestTimeout(requestTimeout),
	)
	if err != nil {
		return nil, err
	}
	return &Writer{messages: client.Beta.Messages}, nil
}

// WriteRecap is notebook.RecapModel: one request, the reply's text.
func (w *Writer) WriteRecap(ctx context.Context, system, prompt string) (string, error) {
	msg, err := w.messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     Model,
		MaxTokens: maxTokens,
		System:    []anthropic.BetaTextBlockParam{{Text: system}},
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(prompt))},
		Thinking:  anthropic.BetaThinkingConfigParamUnion{OfAdaptive: &anthropic.BetaThinkingConfigAdaptiveParam{}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: anthropic.BetaOutputConfigEffortHigh,
		},
	}, betafallback.WithBetaFallbackState(&betafallback.BetaFallbackState{}))
	if err != nil {
		return "", err
	}
	return Text(msg)
}

// Text is the reply's text blocks, or why there is none to use.
func Text(msg *anthropic.BetaMessage) (string, error) {
	switch msg.StopReason {
	case anthropic.BetaStopReasonRefusal:
		return "", errors.New("the model declined to write the recap")
	case anthropic.BetaStopReasonMaxTokens:
		return "", errors.New("the recap ran past the token limit")
	}
	var b strings.Builder
	for _, block := range msg.Content {
		if text, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			b.WriteString(text.Text)
		}
	}
	if strings.TrimSpace(b.String()) == "" {
		return "", fmt.Errorf("no text in the reply (stop reason %q)", msg.StopReason)
	}
	return b.String(), nil
}
