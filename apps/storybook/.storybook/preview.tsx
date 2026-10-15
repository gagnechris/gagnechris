import type { Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import '@web/index.css';
import '@gagnechris/ui/styles.css';
import '@web/kit/kit.css';
import '@web/workspace/workspace.css';
import '@web/notebook/notebookFonts.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default preview;
