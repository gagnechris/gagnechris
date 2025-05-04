const { handler } = require('./resume-download');

describe('Resume Download Serverless Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('returns 405 for non-POST requests', async () => {
    const event = {
      httpMethod: 'GET'
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).error).toBe('Method Not Allowed');
  });
  
  test('returns 400 when required fields are missing', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        // Missing email
        reason: 'Testing validation',
        recipientEmail: 'recipient@example.com'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required fields');
  });
  
  test('returns 200 for successful submissions', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'user@example.com',
        reason: 'Testing successful submission',
        recipientEmail: 'recipient@example.com'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).success).toBe(true);
  });
  
  test('handles errors during processing', async () => {
    // Use a different way to simulate an error
    const event = {
      httpMethod: 'POST',
      // Pass null instead of a string to cause an error
      body: null
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('Internal Server Error');
  });
});