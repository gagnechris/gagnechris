import type { FormEvent } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContactPageBody, PublicLink } from '@gagnechris/public-ui';
import { Button, Field, TextArea, TextInput } from '@gagnechris/ui';
import '@web/public.css';
import '@web/pages/Contact.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';

type FieldName = 'name' | 'email' | 'message';

const FIELDS: readonly {
  name: FieldName;
  label: string;
  placeholder: string;
  type?: 'text' | 'email';
}[] = [
  { name: 'name', label: 'Name', placeholder: 'Your name', type: 'text' },
  {
    name: 'email',
    label: 'Email',
    placeholder: 'you@example.com',
    type: 'email',
  },
  { name: 'message', label: 'Message', placeholder: 'What’s on your mind?' },
];

// The app's form (apps/web/src/pages/Contact.tsx) posts through the API client,
// so this is static markup with the same components.
const MockContactForm = ({
  values = {},
  errors = {},
  status,
}: {
  values?: Partial<Record<FieldName, string>>;
  errors?: Partial<Record<FieldName, string>>;
  status?: string;
}) => (
  <div className="contact-page__body">
    <form
      className="contact-form"
      noValidate
      onSubmit={(event: FormEvent) => event.preventDefault()}
    >
      {FIELDS.map(({ name, label, placeholder, type }) => {
        const props = {
          name,
          defaultValue: values[name] ?? '',
          placeholder,
          'aria-required': true,
        } as const;
        return (
          <Field key={name} label={label} error={errors[name]} tone="editorial">
            {type ? (
              <TextInput {...props} type={type} />
            ) : (
              <TextArea {...props} rows={4} autoGrow={false} />
            )}
          </Field>
        );
      })}
      <p className="contact-form__status" role="alert">
        {status ? (
          <span className="contact-form__message">{status}</span>
        ) : null}
      </p>
      <Button
        type="submit"
        variant="primary"
        tone="editorial"
        className="contact-form__submit"
      >
        Send message
      </Button>
    </form>
  </div>
);

const meta = {
  title: 'Public site/ContactPageBody',
  component: ContactPageBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      'none: iOS has no contact form',
      'The Contact page. The published page has no form and offers LinkedIn; the app passes its form as `children` once hydrated. The form here is a static mock of the app’s.',
    ),
  },
  decorators: [withSiteChrome('/contact')],
} satisfies Meta<typeof ContactPageBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithForm: Story = { args: { children: <MockContactForm /> } };

export const Published: Story = {};

export const FieldErrors: Story = {
  args: {
    children: (
      <MockContactForm
        values={{ name: 'Sam', email: 'sam@example' }}
        errors={{
          email: 'Enter a valid email address.',
          message: 'Enter a message.',
        }}
        status="Please fix the 2 highlighted fields."
      />
    ),
  },
};

export const SendFailed: Story = {
  args: {
    children: (
      <MockContactForm
        values={{
          name: 'Sam Rivera',
          email: 'sam@example.com',
          message: 'Hi Chris, I enjoyed the post on prerendering.',
        }}
        status="Your message wasn’t sent. Please try again."
      />
    ),
  },
};

export const Sent: Story = {
  args: {
    children: (
      <div className="contact-page__body">
        <section className="contact-success" aria-labelledby="contact-sent">
          <h2 id="contact-sent" tabIndex={-1}>
            Thanks, your message is on its way.
          </h2>
          <p>I’ll reply to the email address you gave.</p>
          <ul className="contact-success__links">
            <li>
              <PublicLink href="/">Back to Home</PublicLink>
            </li>
            <li>
              <PublicLink href="/dont-feed-the-bears?from=contact">
                Don’t feed the bears while you wait
              </PublicLink>
            </li>
          </ul>
        </section>
      </div>
    ),
  },
};
