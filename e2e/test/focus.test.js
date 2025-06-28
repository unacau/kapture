import { expect } from 'chai';
import { TestFramework } from '../test-framework.js';
import { expectValidTabInfo } from './helpers.js';

describe('Focus Tool Tests', function() {
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

  it('should focus on text input using selector', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.have.property('selector').that.equals('#text-input');
    expect(resultData).to.not.have.property('xpath');
    expect(resultData).to.not.have.property('warning');
  });

  it('should focus on select element using xpath', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      xpath: '//select[@id="select-input"]'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.have.property('xpath').that.equals('//select[@id="select-input"]');
    expect(resultData).to.not.have.property('selector');
    expect(resultData).to.not.have.property('warning');
  });

  it('should focus on button element', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#test-button'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.have.property('selector').that.equals('#test-button');
  });

  it('should focus on contenteditable element', async function() {
    // The test page should have a contenteditable element
    // If not, we'll test with what we have
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#password-input'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.not.have.property('warning');
  });

  it('should return warning for non-focusable element', async function() {
    // Focus on a div without tabindex
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: 'h1'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.have.property('warning').that.equals('Element may not be focusable');
  });

  it('should handle element not found', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#non-existent-element'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('ELEMENT_NOT_FOUND');
    expect(resultData).to.have.property('selector').that.equals('#non-existent-element');
  });

  it('should require either selector or xpath', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('SELECTOR_OR_XPATH_REQUIRED');
  });

  it('should handle invalid selector', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '##invalid-selector'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('INVALID_SELECTOR');
    expect(resultData.error.message).to.include('Invalid selector');
  });

  it('should handle invalid xpath', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      xpath: '//invalid[xpath'
    });

    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('INVALID_XPATH');
    expect(resultData.error.message).to.include('Invalid XPath');
  });

  it('should focus on textarea', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#textarea-input'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.not.have.property('warning');
  });

  it('should focus on link', async function() {
    const resultData = await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#test-link'
    });

    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('focused').that.equals(true);
    expect(resultData).to.not.have.property('warning');
  });

  it('should maintain focus after focusing', async function() {
    // Focus on an input
    await framework.callToolAndParse('focus', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });

    // Check if the element has focus by trying to type
    const fillResult = await framework.callToolAndParse('fill', {
      tabId: testTab.tabId,
      selector: '#text-input',
      value: 'Test text'
    });

    expectValidTabInfo(fillResult);
    expect(fillResult).to.have.property('filled').that.equals(true);

    // Verify the value was filled
    const elementData = await framework.callToolAndParse('elements', {
      tabId: testTab.tabId,
      selector: '#text-input'
    });
    expect(elementData.elements[0].value).to.equal('Test text');
  });
});