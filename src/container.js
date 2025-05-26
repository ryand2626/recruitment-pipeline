// src/container.js
class DIContainer {
    constructor() {
        this.services = {};
        this.instances = {};
    }

    register(name, factory) {
        if (this.services[name]) {
            console.warn(`Service with name ${name} is already registered. Overwriting.`);
        }
        this.services[name] = factory;
    }

    get(name) {
        if (!this.services[name]) {
            throw new Error(`Service not found: ${name}`);
        }

        if (!this.instances[name]) {
            // Pass the container itself to the factory, so it can resolve dependencies
            this.instances[name] = this.services[name](this);
        }

        return this.instances[name];
    }
}

const container = new DIContainer();
module.exports = container;
