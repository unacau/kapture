import { expect } from 'chai';
import { TestFramework } from '../test-framework.js';

describe('Kapture E2E Tests', function() {
  let framework;

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

  describe('Basic Functionality', function() {
    it('should list available resources', async function() {
      const resources = await framework.listResources();

      expect(resources).to.be.an('array');
      expect(resources.length).to.be.greaterThan(0);

      // Should have tabs resource
      const tabsResource = resources.find(r => r.uri === 'kapture://tabs');
      expect(tabsResource).to.exist;
      expect(tabsResource.name).to.equal('Connected Browser Tabs');
    });

    it('should list available tools', async function() {
      const tools = await framework.listTools();

      expect(tools).to.be.an('array');
      expect(tools.length).to.be.greaterThan(0);

      // Check for essential tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).to.include('navigate');
      expect(toolNames).to.include('click');
      expect(toolNames).to.include('fill');
      expect(toolNames).to.include('screenshot');
    });

    it('should query tabs and find test page', async function() {
      const testTab = await framework.ensureTestTab();

      expect(testTab).to.have.property('tabId');
      expect(testTab).to.have.property('url');
      expect(testTab.url).to.include('test.html');
    });
  });

  describe('Tab Operations', function() {
    let testTab;

    beforeEach(async function() {
      testTab = await framework.ensureTestTab();

      // Refresh the page to reset state by navigating to itself
      await framework.callTool('navigate', {
        tabId: testTab.tabId,
        url: testTab.url
      });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for navigation
    });

    it('should navigate to a URL', async function() {
      const result = await framework.callTool('navigate', {
        tabId: testTab.tabId,
        url: 'http://localhost:61822/test.html?navigated=true'
      });

      // Check that we got a response
      const resultData = JSON.parse(result.content[0].text);
      expect(resultData).to.have.property('url');

      // Wait a bit for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify navigation happened by checking current tab state
      const tabInfo = await framework.readResource(`kapture://tab/${testTab.tabId}`);
      const tab = JSON.parse(tabInfo.contents[0].text);
      expect(tab.url).to.equal('http://localhost:61822/test.html?navigated=true');
    });

    it('should take a screenshot', async function() {
      const result = await framework.callTool('screenshot', {
        tabId: testTab.tabId
      });

      expect(result.content).to.have.lengthOf(2);
      expect(result.content[0].type).to.equal('text');
      expect(result.content[1].type).to.equal('image');
      expect(result.content[1].mimeType).to.match(/^image\//);
      expect(result.content[1].data).to.be.a('string');
    });
  });
});
