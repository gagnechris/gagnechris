package notebook

import (
	"context"
	"log/slog"
)

// LocalRecapModel stands in for Claude outside AWS: its recap is the
// prompt the model would get.
type LocalRecapModel struct{}

func (LocalRecapModel) WriteRecap(_ context.Context, _, prompt string) (string, error) {
	return "## The week\n\nWritten on the local stack, without a model. This is the prompt Claude gets:\n\n~~~~text\n" + prompt + "~~~~", nil
}

// InProcessRecaps runs each job on its own goroutine, as the recap Lambda
// would.
type InProcessRecaps struct {
	Recapper *Recapper
	Log      *slog.Logger
}

func (p InProcessRecaps) StartRecap(ctx context.Context, job RecapJob) error {
	go func() {
		if err := p.Recapper.Run(context.WithoutCancel(ctx), job); err != nil {
			p.Log.Error("weekly recap failed", "noteId", job.NoteID, "error", err)
		}
	}()
	return nil
}
