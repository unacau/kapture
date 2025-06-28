import { expect } from 'chai';
import { TestFramework } from '../test-framework.js';
import { expectValidTabInfo } from './helpers.js';

describe('Elements Tool Tests', function() {
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

  it('should get elements by CSS selector', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: 'h1'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('selector').that.equals('h1');
    expect(resultData).to.have.property('elements').that.is.an('array');
    expect(resultData.elements).to.have.lengthOf(1);

    const element = resultData.elements[0];
    expect(element).to.have.property('tagName').that.equals('h1');
    expect(element).to.have.property('selector').that.is.a('string');
    expect(element).to.have.property('bounds').that.is.an('object');
    expect(element.bounds).to.have.all.keys('x', 'y', 'width', 'height');
    expect(element).to.have.property('visible').that.is.a('boolean');
  });

  it('should get multiple elements', async function() {
    // Test page has multiple p elements
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: 'p'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData.elements).to.be.an('array');
    expect(resultData.elements.length).to.be.greaterThan(1);
    
    // Check that we got multiple p elements
    resultData.elements.forEach((element) => {
      expect(element).to.have.property('tagName').that.equals('p');
      expect(element).to.have.property('visible').that.is.a('boolean');
    });
  });

  it('should get elements by XPath', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      xpath: '//h1'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('xpath').that.equals('//h1');
    expect(resultData).to.not.have.property('selector');
    expect(resultData).to.have.property('elements').that.is.an('array');
    expect(resultData.elements).to.have.lengthOf(1);
    expect(resultData.elements[0].tagName).to.equal('h1');
  });

  it('should filter by visibility', async function() {
    // Test page has visible and hidden elements
    // Get all div elements in the visibility test section
    const allResult = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: '#visible-element, #hidden-element, #zero-height'
    });

    const allData = JSON.parse(allResult.content[0].text);
    expect(allData.elements).to.have.lengthOf(3);

    // Get only visible elements
    const visibleResult = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: '#visible-element, #hidden-element, #zero-height',
      visible: 'true'
    });

    const visibleData = JSON.parse(visibleResult.content[0].text);
    expectValidTabInfo(visibleData);
    expect(visibleData).to.have.property('visible').that.equals('true');
    expect(visibleData.elements).to.have.lengthOf(1);
    expect(visibleData.elements[0].id).to.equal('visible-element');
    expect(visibleData.elements[0].visible).to.equal(true);
  });

  it('should return empty array when no elements match', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: '.non-existent-class'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData).to.have.property('elements').that.is.an('array');
    expect(resultData.elements).to.have.lengthOf(0);
  });

  it('should handle complex CSS selectors', async function() {
    // Test page has form elements with specific attributes
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: 'input[type="text"]'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData.elements).to.have.lengthOf(1);
    expect(resultData.elements[0]).to.have.property('tagName').that.equals('input');
    expect(resultData.elements[0]).to.have.property('id').that.equals('text-input');
  });

  it('should handle complex XPath expressions', async function() {
    // Find buttons that are not disabled
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      xpath: '//button[not(@disabled)]'
    });

    const resultData = JSON.parse(result.content[0].text);
    expectValidTabInfo(resultData);
    expect(resultData.elements.length).to.be.greaterThan(0);
    
    // Verify we got buttons
    resultData.elements.forEach(element => {
      expect(element).to.have.property('tagName').that.equals('button');
    });
  });

  it('should handle invalid CSS selector', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      selector: '!!!invalid>>>'
    });

    const resultData = JSON.parse(result.content[0].text);
    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('INVALID_SELECTOR');
  });

  it('should handle invalid XPath', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId,
      xpath: '//[invalid'
    });

    const resultData = JSON.parse(result.content[0].text);
    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('INVALID_XPATH');
  });

  it('should require either selector or xpath', async function() {
    const result = await framework.callTool('elements', {
      tabId: testTab.tabId
    });

    const resultData = JSON.parse(result.content[0].text);
    expect(resultData).to.have.property('error');
    expect(resultData.error.code).to.equal('SELECTOR_OR_XPATH_REQUIRED');
  });
});