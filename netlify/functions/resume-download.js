// This is a Netlify serverless function to handle resume download notifications
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { name, email, reason, recipientEmail } = data;
    
    // Validate required fields
    if (!name || !email || !reason || !recipientEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }
    
    // In a real implementation, you would send an email here using a service like SendGrid, Mailgun, etc.
    console.log('Sending notification email to:', recipientEmail);
    console.log('Download information:', { name, email, reason });
    
    // For now, we'll just return a success response
    // In a real implementation, you would configure an email service
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error processing download request:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};