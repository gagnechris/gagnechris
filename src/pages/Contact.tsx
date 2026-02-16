import { Link } from 'react-router-dom';
import { useState, FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { trackEvent } from '../utils/analytics';
import './Contact.css';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const FORMSPREE_ENDPOINT = 'xaqdoojb';

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      // Submit to Formspree
      const response = await fetch(`https://formspree.io/f/${FORMSPREE_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Track successful form submission
        trackEvent('submit', 'contact_form', 'contact_page');
        setSubmitted(true);
      } else {
        // Handle error
        setErrors({ submit: 'Failed to send message. Please try again.' });
      }
    } catch (error) {
      console.error('Form submission error:', error);
      setErrors({ submit: 'Failed to send message. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error for this field when user starts typing
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
        <Helmet>
          <title>Thank You - Chris Gagne</title>
        </Helmet>
        <header>
          <h1>Contact</h1>
          <Link to="/" className="back-link">Back to Home</Link>
        </header>
        <main>
          <div className="success-message">
            <h2>Thank You!</h2>
            <p>Your message has been sent successfully. I'll get back to you as soon as possible.</p>
            <Link to="/" className="btn-home">Return to Home</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="contact-page">
      <Helmet>
        <title>Contact - Chris Gagne</title>
        <meta
          name="description"
          content="Get in touch with Chris Gagne. Send a message and I'll get back to you as soon as possible."
        />
        <meta property="og:title" content="Contact - Chris Gagne" />
        <meta
          property="og:description"
          content="Get in touch with Chris Gagne. Send a message and I'll get back to you as soon as possible."
        />
        <meta property="og:url" content="https://gagnechris.com/contact" />
        <link rel="canonical" href="https://gagnechris.com/contact" />
      </Helmet>
      <header>
        <h1>Contact</h1>
        <Link to="/" className="back-link">Back to Home</Link>
      </header>
      <main>
        <div className="contact-intro">
          <p>
            Have a question or want to get in touch? Fill out the form below and I'll get back to you as soon as possible.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="contact-form"
        >

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
