import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ContactRequestSchema,
  contactFieldMessage,
  pageTitle,
  siteUrl,
} from '@gagnechris/shared';
import { ContactPageBody } from '@gagnechris/public-ui';
import { createPublicApiClient } from '../api/public-client';
import { trackEvent } from '../utils/analytics';
import './Contact.css';
import PageHead from '../components/PageHead';
import SiteLink from '../components/SiteLink';
import { useHydrated } from '../prerender/useHydrated';

type FieldName = 'name' | 'email' | 'message';

const FIELDS: readonly {
  name: FieldName;
  label: string;
  placeholder: string;
  type?: 'text' | 'email';
  autoComplete: string;
}[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'Your name',
    type: 'text',
    autoComplete: 'name',
  },
  {
    name: 'email',
    label: 'Email',
    placeholder: 'you@example.com',
    type: 'email',
    autoComplete: 'email',
  },
  {
    name: 'message',
    label: 'Message',
    placeholder: 'What’s on your mind?',
    autoComplete: 'off',
  },
];

type FieldErrors = Partial<Record<FieldName, string>>;

const SEND_FAILED = 'Your message wasn’t sent. Please try again.';
const RATE_LIMITED = 'Too many messages. Please wait a bit and try again.';

const isField = (key: string): key is FieldName =>
  FIELDS.some((f) => f.name === key);

const fieldsSummary = (count: number): string =>
  count === 1
    ? 'Please fix the highlighted field.'
    : `Please fix the ${count} highlighted fields.`;

const errorId = (name: FieldName) => `contact-${name}-error`;

function Contact() {
  const hydrated = useHydrated();
  // Client-only elapsed clock — avoids comparing browser Date.now to server time.
  const [formOpenedAt] = useState(() => performance.now());
  const [values, setValues] = useState<Record<FieldName, string>>({
    name: '',
    email: '',
    message: '',
  });
  const [hpField, setHpField] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const fieldRefs = useRef<
    Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});
  const pendingFocus = useRef<FieldName | null>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  // After the render that sets aria-describedby, so the error is read on focus.
  useEffect(() => {
    const field = pendingFocus.current;
    if (!field) return;
    pendingFocus.current = null;
    fieldRefs.current[field]?.focus();
  });

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  const showFieldErrors = (errors: FieldErrors) => {
    const invalid = FIELDS.filter((f) => errors[f.name]);
    setFieldErrors(errors);
    setStatus(fieldsSummary(invalid.length));
    pendingFocus.current = invalid[0]?.name ?? null;
  };

  const validate = () => {
    const elapsedMs = Math.max(0, Math.round(performance.now() - formOpenedAt));
    const parsed = ContactRequestSchema.safeParse({
      ...values,
      hp_field: hpField,
      elapsedMs,
    });
    if (parsed.success) return parsed.data;
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (isField(key) && !errors[key]) {
        errors[key] = contactFieldMessage(key, issue.code);
      }
    }
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
    } else {
      setFieldErrors({});
      setStatus(SEND_FAILED);
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const body = validate();
    if (!body) return;

    setFieldErrors({});
    setStatus('');
    setSubmitting(true);
    try {
      const client = createPublicApiClient();
      const { error, response } = await client.POST('/api/contact', { body });

      if (!error) {
        trackEvent('submit', 'contact_form', 'contact_page');
        setSubmitted(true);
        return;
      }

      const errors: FieldErrors = {};
      for (const [key, code] of Object.entries(error.fields ?? {})) {
        if (isField(key)) {
          errors[key] = contactFieldMessage(
            key,
            typeof code === 'string' ? code : 'invalid',
          );
        }
      }
      if (Object.keys(errors).length > 0) {
        showFieldErrors(errors);
      } else if (response.status === 429) {
        setStatus(error.message || RATE_LIMITED);
      } else {
        setStatus(error.message || SEND_FAILED);
      }
    } catch (err) {
      console.error('Form submission error:', err);
      setStatus(SEND_FAILED);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (!isField(name)) return;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <>
      <PageHead title={pageTitle('Contact')} url={siteUrl('/contact')} />
      <ContactPageBody>
        {hydrated ? (
          <div className="contact-page__body">
            {submitted ? (
              <section
                className="contact-success"
                aria-labelledby="contact-sent"
              >
                <h2 id="contact-sent" ref={successRef} tabIndex={-1}>
                  Thanks, your message is on its way.
                </h2>
                <p>I’ll reply to the email address you gave.</p>
                <ul className="contact-success__links">
                  <li>
                    <SiteLink href="/">Back to Home</SiteLink>
                  </li>
                  <li>
                    <SiteLink href="/dont-feed-the-bears?from=contact">
                      Don’t feed the bears while you wait
                    </SiteLink>
                  </li>
                </ul>
              </section>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="contact-form"
                autoComplete="on"
                noValidate
              >
                {/* Honeypot — nonsemantic name resists autofill. */}
                <div className="hp-field" aria-hidden="true">
                  <label htmlFor="hp_field">Leave blank</label>
                  <input
                    type="text"
                    id="hp_field"
                    name="hp_field"
                    value={hpField}
                    onChange={(e) => setHpField(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {FIELDS.map(
                  ({ name, label, placeholder, type, autoComplete }) => {
                    const error = fieldErrors[name];
                    const props = {
                      id: name,
                      name,
                      value: values[name],
                      onChange: handleChange,
                      placeholder,
                      autoComplete,
                      'aria-required': true,
                      'aria-invalid': error ? true : undefined,
                      'aria-describedby': error ? errorId(name) : undefined,
                    } as const;
                    const ref = (
                      el: HTMLInputElement | HTMLTextAreaElement | null,
                    ) => {
                      fieldRefs.current[name] = el;
                    };
                    return (
                      <div className="contact-field" key={name}>
                        <label htmlFor={name}>{label}</label>
                        {type ? (
                          <input {...props} type={type} ref={ref} />
                        ) : (
                          <textarea {...props} rows={4} ref={ref} />
                        )}
                        {error ? (
                          <p
                            className="contact-field__error"
                            id={errorId(name)}
                          >
                            {error}
                          </p>
                        ) : null}
                      </div>
                    );
                  },
                )}

                <p className="contact-form__status" role="alert">
                  {status ? (
                    <span className="contact-form__message">{status}</span>
                  ) : null}
                </p>

                <button
                  type="submit"
                  className="contact-form__submit"
                  aria-disabled={submitting || undefined}
                >
                  {submitting ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        ) : null}
      </ContactPageBody>
    </>
  );
}

export default Contact;
