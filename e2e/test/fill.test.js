import { expect } from 'chai';
import { TestFramework } from '../test-framework.js';
import { expectValidTabInfo } from './helpers.js';

describe('Fill Tool Tests', function() {
  let framework;
  let testTab;

  before(async function() {
    framework = new TestFramework();

    // Start server
    console.log('Starting server...');
    await framework.startServer();

    // Connect MCP client
    console.log('Connecting MCP client...');
    await framework.connectMCP();
  });

  after(async function() {
    await framework.cleanup();
  });

  beforeEach(async function() {
    testTab = await framework.ensureTestTab();

    // Navigate to test page to ensure clean state
    await framework.callTool('navigate', {
      tabId: testTab.tabId,
      url: "http://localhost:61822/test.html"
    });
  });

  it('should fill text input', async function() {
    const testValue = 'Hello, Kapture!';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: testValue
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('selector').that.equals('#text-input');
    expect(resultData).to.have.property('filled').that.equals(true);
    
    // Verify the value was actually set
    const elementData = await framework.callToolAndParse('elements', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });
    expect(elementData.elements[0].value).to.equal(testValue);
  });

  it('should fill email input', async function() {
    const testEmail = 'test@example.com';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#email-input',
      value: testEmail
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
  });

  it('should fill password input', async function() {
    const testPassword = 'SecurePassword123!';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#password-input',
      value: testPassword
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
  });

  it('should fill textarea', async function() {
    const multilineText = 'Line 1\nLine 2\nLine 3';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#textarea-input',
      value: multilineText
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
  });

  it('should clear existing value before filling', async function() {
    // First fill with initial value
    await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: 'Initial value'
    });

    // Then fill with new value
    const newValue = 'New value';
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: newValue
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
    
    // Verify only new value exists
    const elementData = await framework.callToolAndParse('elements', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });
    expect(elementData.elements[0].value).to.equal(newValue);
    expect(elementData.elements[0].value).to.not.include('Initial value');
  });

  it('should fill using XPath selector', async function() {
    const testValue = 'XPath fill test';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      xpath: '//input[@id="text-input"]',
      value: testValue
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('xpath').that.equals('//input[@id="text-input"]');
    expect(resultData).to.not.have.property('selector');
    expect(resultData).to.have.property('filled').that.equals(true);
  });

  it('should handle element not found', async function() {
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#non-existent-input',
      value: 'test'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('ELEMENT_NOT_FOUND');
    expect(resultData).to.have.property('selector').that.equals('#non-existent-input');
  });

  it('should handle non-fillable elements', async function() {
    // Try to fill a div element
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#visible-element',
      value: 'test'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('INVALID_ELEMENT');
    expect(resultData.error.message).to.include('Element is not fillable');
  });

  it('should handle empty value', async function() {
    // First fill with a value
    await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: 'Some text'
    });

    // Then fill with empty string
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: ''
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
    
    // Verify the field is actually empty using elements tool
    const elementData = await framework.callToolAndParse('elements', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });
    // When value is empty, the value property might not be included
    const inputValue = elementData.elements[0].value || '';
    expect(inputValue).to.equal('');
  });

  it('should successfully fill input with various characters', async function() {
    // Test with special characters and unicode
    const specialValue = 'Test with special chars: !@#$%^&*() and unicode: 🎉';
    
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: specialValue
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('filled').that.equals(true);
    
    // Verify the value was set correctly
    const elementData = await framework.callToolAndParse('elements', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });
    expect(elementData.elements[0].value).to.equal(specialValue);
  });

  it('should require either selector or xpath', async function() {
    const resultData = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      value: 'test'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('SELECTOR_OR_XPATH_REQUIRED');
  });
});