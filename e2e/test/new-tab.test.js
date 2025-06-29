import { expect } from 'chai';
import { framework } from '../test-framework.js';

describe.only('New Tab Tool Tests', function() {
  it('should open a new tab with the MCP usage documentation', async function() {
    this.timeout(20000); // Give it more time to open browser and connect

    const result = await framework.callTool('new_tab', {});
    const resultData = JSON.parse(result.content[0].text);

    expect(resultData).to.have.property('tabId');
    expect(resultData).to.have.property('url');
    expect(resultData.url).to.include('MCP_USAGE.html');
    expect(resultData.url).to.include('kapture-connect=true');

    // Verify the tab is in the tabs list
    const tabsResult = await framework.callTool('list_tabs', {});
    const tabsData = JSON.parse(tabsResult.content[0].text);

    const newTab = tabsData.tabs.find(tab => tab.tabId === resultData.tabId);
    expect(newTab).to.exist;
    expect(newTab.url).to.equal(resultData.url);
  });

  it('should handle multiple new tabs', async function() {
    this.timeout(30000);

    // Open first tab
    const result1 = await framework.callTool('new_tab', {});
    const tab1 = JSON.parse(result1.content[0].text);
    
    // Open second tab
    const result2 = await framework.callTool('new_tab', {});
    const tab2 = JSON.parse(result2.content[0].text);

    // Both should have different tab IDs
    expect(tab1.tabId).to.not.equal(tab2.tabId);

    // Both should be in the tabs list
    const tabsResult = await framework.callTool('list_tabs', {});
    const tabsData = JSON.parse(tabsResult.content[0].text);

    const foundTab1 = tabsData.tabs.find(tab => tab.tabId === tab1.tabId);
    const foundTab2 = tabsData.tabs.find(tab => tab.tabId === tab2.tabId);

    expect(foundTab1).to.exist;
    expect(foundTab2).to.exist;
  });
});
