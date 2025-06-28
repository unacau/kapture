import { expect } from 'chai';
import { TestFramework } from '../test-framework.js';
import { expectValidTabInfo } from './helpers.js';

describe('DOM Tool Tests', function() {
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

  it('should get DOM HTML', async function() {
    // Get full body HTML
    const result = await framework.callTool('dom', {
      tabId: testTab.tabId
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('html').that.is.a('string');
    expect(resultData.html).to.include('<body');
    expect(resultData.html).to.include('</body>');
  });

  it('should get DOM HTML for specific element', async function() {
    // Get HTML for h1 element
    const result = await framework.callTool('dom', {
      tabId: testTab.tabId,
      selector: 'h1'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('html').that.is.a('string');
    expect(resultData).to.have.property('selector').that.is.a('string');
    expect(resultData.html).to.equal('<h1>Kapture Window Events Test</h1>');
  });

  it('should get DOM HTML using XPath', async function() {
    // Get HTML for h1 element using XPath
    const result = await framework.callTool('dom', {
      tabId: testTab.tabId,
      xpath: '//h1'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('html').that.is.a('string');
    expect(resultData).to.have.property('xpath').that.equals('//h1');
    expect(resultData).to.not.have.property('selector');
    expect(resultData.html).to.equal('<h1>Kapture Window Events Test</h1>');
  });

  it('should handle DOM element not found', async function() {
    const result = await framework.callTool('dom', {
      tabId: testTab.tabId,
      selector: '#non-existent-element'
    });

    const resultData = JSON.parse(result.content[0].text);
    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('ELEMENT_NOT_FOUND');
    expect(resultData).to.have.property('selector').that.equals('#non-existent-element');
  });

  it('should handle XPath element not found', async function() {
    const result = await framework.callTool('dom', {
      tabId: testTab.tabId,
      xpath: '//div[@id="non-existent"]'
    });

    const resultData = JSON.parse(result.content[0].text);
    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('ELEMENT_NOT_FOUND');
    expect(resultData).to.have.property('xpath').that.equals('//div[@id="non-existent"]');
    expect(resultData).to.not.have.property('selector');
  });
});