import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import { useState, FormEvent } from 'react';
import { ContactRequestSchema } from '@gagnechris/shared';
import { createPublicApiClient } from '../api/public-client';
import { trackEvent } from '../utils/analytics';
import './Contact.css';

const FIELD_CODE_MESSAGES: Record<string, string> = {
  too_small: 'This field is required',
  too_big: 'This value is too long',
  invalid_format: 'Enter a valid value',
  invalid_string: 'Enter a valid value',
  invalid_type: 'Enter a valid value',
};

function friendlyFieldMessage(field: string, code: string): string {
  if (
    field === 'email' &&
    (code === 'invalid_format' || code === 'invalid_string')
  ) {
    return 'Enter a valid email address';
  }
  return FIELD_CODE_MESSAGES[code] ?? 'Please check this field';
}

function Contact() {
  // Client-only elapsed clock — avoids comparing browser Date.now to server time.
  const [formOpenedAt] = useState(() => performance.now());
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    hp_field: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateForm = () => {
    const elapsedMs = Math.max(0, Math.round(performance.now() - formOpenedAt));
    const parsed = ContactRequestSchema.safeParse({
      name: formData.name,
      email: formData.email,
      message: formData.message,
      hp_field: formData.hp_field,
      elapsedMs,
    });
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const newErrors: { [key: string]: string } = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? String(issue.path[0]) : 'submit';
      if (!(key in newErrors)) {
        newErrors[key] = issue.message;
      }
    }
    setErrors(newErrors);
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const body = validateForm();
    if (!body) {
      return;
    }

    setSubmitting(true);

    try {
      const client = createPublicApiClient();
      const { error, response } = await client.POST('/api/contact', { body });

      if (!error) {
        trackEvent('submit', 'contact_form', 'contact_page');
        setSubmitted(true);
        return;
      }

      const fieldErrors: { [key: string]: string } = {};
      if (error.fields) {
        for (const [key, code] of Object.entries(error.fields)) {
          fieldErrors[key] = friendlyFieldMessage(
            key,
            typeof code === 'string' ? code : 'invalid',
          );
        }
      }
      let message =
        error.message ?? 'Failed to send message. Please try again.';
      if (response.status === 429) {
        message =
          error.message ||
          'Too many submissions. Please wait a bit and try again.';
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors({
          ...fieldErrors,
          ...(error.message ? { submit: message } : {}),
        });
      } else {
        setErrors({ submit: message });
      }
    } catch (err) {
      console.error('Form submission error:', err);
      setErrors({ submit: 'Failed to send message. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  if (submitted) {
    return (
      <div className="contact-page">
        <title>Thank You - Chris Gagne</title>
        <header>
          <h1>Contact</h1>
          <PublicNav current="/contact" />
        </header>
        <main>
          <div className="success-message">
            <h2>Thank You!</h2>
            <p>
              Your message has been sent successfully. I'll get back to you as
              soon as possible.
            </p>
            <p className="contact-bear-nudge">
              While you wait —{' '}
              <Link to="/dont-feed-the-bears?from=contact">
                Don't Feed the Bears
              </Link>
              ?
            </p>
            <Link to="/" className="btn-home">
              Return to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="contact-page">
      <title>Contact - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/contact" />
      <header>
        <h1>Contact</h1>
        <PublicNav current="/contact" />
      </header>
      <main>
        <div className="contact-intro">
          <p>
            Have a question or want to get in touch? Fill out the form below and
            I'll get back to you as soon as possible.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="contact-form"
          autoComplete="on"
        >
          {/* Honeypot — nonsemantic name resists autofill (CHR-98). */}
          <div className="hp-field" aria-hidden="true">
            <label htmlFor="hp_field">Leave blank</label>
            <input
              type="text"
              id="hp_field"
              name="hp_field"
              value={formData.hp_field}
              onChange={handleChange}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="name">
              Name <span className="required">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? 'error' : ''}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <span id="name-error" className="error-message" role="alert">
                {errors.name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">
              Email <span className="required">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? 'error' : ''}
              aria-required="true"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" className="error-message" role="alert">
                {errors.email}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="message">
              Message <span className="required">*</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              value={formData.message}
              onChange={handleChange}
              className={errors.message ? 'error' : ''}
              aria-required="true"
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? 'message-error' : undefined}
            />
            {errors.message && (
              <span id="message-error" className="error-message" role="alert">
                {errors.message}
              </span>
            )}
          </div>

          {errors.submit && (
            <div className="form-error" role="alert">
              {errors.submit}
            </div>
          )}

          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default Contact;
