export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#111' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Last updated: April 25, 2025</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>1. About Kapturo</h2>
        <p>Kapturo is a B2B prospecting and sales automation platform. We help businesses find, qualify, and contact potential clients using AI-powered tools and integrations with public data sources and messaging channels including WhatsApp Business.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>2. Data We Collect</h2>
        <p>We collect and process the following types of data:</p>
        <ul style={{ paddingLeft: 24, marginTop: 8, lineHeight: 1.8 }}>
          <li>Business contact information (name, email, phone, company)</li>
          <li>WhatsApp message content when using our messaging features</li>
          <li>Usage data and platform interactions</li>
          <li>Account credentials and authentication tokens</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>3. How We Use Your Data</h2>
        <p>We use collected data to:</p>
        <ul style={{ paddingLeft: 24, marginTop: 8, lineHeight: 1.8 }}>
          <li>Provide and improve our prospecting and CRM services</li>
          <li>Send and receive WhatsApp messages on your behalf via Meta's WhatsApp Business API</li>
          <li>Generate AI-powered content and lead qualification</li>
          <li>Authenticate users and maintain account security</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>4. WhatsApp and Meta</h2>
        <p>Kapturo integrates with Meta's WhatsApp Business API. By using our messaging features, you agree to Meta's <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>WhatsApp Business Terms of Service</a>. We do not share your message content with third parties beyond what is necessary to deliver the service.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>5. Data Sharing</h2>
        <p>We do not sell your personal data. We may share data with:</p>
        <ul style={{ paddingLeft: 24, marginTop: 8, lineHeight: 1.8 }}>
          <li>Service providers necessary to operate the platform (hosting, email, AI)</li>
          <li>Meta, when using WhatsApp Business API features</li>
          <li>Legal authorities if required by law</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>6. Data Retention</h2>
        <p>We retain your data for as long as your account is active or as needed to provide our services. You may request deletion of your data at any time by contacting us.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>7. Your Rights</h2>
        <p>Depending on your location, you may have rights to access, correct, delete, or export your personal data. To exercise these rights, contact us at <a href="mailto:catalina@kapturo.cl" style={{ color: '#2563eb' }}>catalina@kapturo.cl</a>.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>8. Data Deletion</h2>
        <p>To request deletion of your data, send an email to <a href="mailto:catalina@kapturo.cl" style={{ color: '#2563eb' }}>catalina@kapturo.cl</a> with subject "Data Deletion Request". We will process your request within 30 days.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>9. Security</h2>
        <p>We implement industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and JWT authentication to protect your data.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>10. Contact</h2>
        <p>For any privacy-related questions, contact us at:<br />
        <strong>Kapturo</strong><br />
        Email: <a href="mailto:catalina@kapturo.cl" style={{ color: '#2563eb' }}>catalina@kapturo.cl</a><br />
        Website: <a href="https://kapturo.cl" style={{ color: '#2563eb' }}>https://kapturo.cl</a>
        </p>
      </section>
    </div>
  )
}
