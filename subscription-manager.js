// Subscription Manager
class SubscriptionManager {
    constructor() {
        this.subscriptions = GM_getValue('ytSubscriptions', []);
    }

    addSubscription(channelName, channelId = null) {
        if (!channelName || channelName.trim() === '') return false;

        const subscription = {
            name: channelName.trim(),
            id: channelId,
            addedAt: Date.now()
        };

        // Check for duplicates
        const exists = this.subscriptions.some(sub =>
            sub.name.toLowerCase() === subscription.name.toLowerCase() ||
            (channelId && sub.id === channelId)
        );

        if (!exists) {
            this.subscriptions.push(subscription);
            this.save();
            return true;
        }
        return false;
    }

    removeSubscription(index) {
        if (index >= 0 && index < this.subscriptions.length) {
            this.subscriptions.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    getSubscriptions() {
        return this.subscriptions;
    }

    save() {
        GM_setValue('ytSubscriptions', this.subscriptions);
    }
}