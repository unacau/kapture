export class PortManager {
  constructor() {
    this.ports = [];
  }

  addPort(port) {
    this.ports.push(port);

    port.onDisconnect.addListener(() => {
      this.removePort(port);
    });

    return port;
  }

  removePort(port) {
    const index = this.ports.indexOf(port);
    if (index > -1) {
      this.ports.splice(index, 1);
    }
  }

  broadcast(message) {
    const deadPorts = [];

    this.ports.forEach(port => {
      try {
        port.postMessage(message);
      } catch (error) {
        deadPorts.push(port);
      }
    });

    deadPorts.forEach(port => this.removePort(port));
  }

  sendToPort(port, message) {
    try {
      port.postMessage(message);
      return true;
    } catch (error) {
      this.removePort(port);
      return false;
    }
  }

  get count() {
    return this.ports.length;
  }
}