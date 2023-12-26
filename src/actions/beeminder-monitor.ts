import streamDeck, {
    Action,
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";
import fetch from 'node-fetch';

class BeeminderSettings {
    apiToken: string;

    constructor(apiToken: string) {
        this.apiToken = apiToken;
    }
}

interface GoalData {
    roadstatuscolor: string;
    limsum: string;
    slug: string;
    currate: number;
    graphsum: string;
    recent_data: DataPoint[];
    curday: number;
    safebuf: number;
}

interface DataPoint {
    value: number,
    daystamp: string,
}

/**
 * An example action class that displays a count that increments by one each time the button is pressed.
 */
@action({UUID: "com.johnlong.beeminder.monitor"})
export class BeeminderMonitor extends SingletonAction<GoalSettings> {
    logger = streamDeck.logger.createScope("Monitor");

    /**
     * The {@link SingletonAction.onWillAppear} event is useful for setting the visual representation of an action when it become visible. This could be due to the Stream Deck first
     * starting up, or the user navigating between pages / folders etc.. There is also an inverse of this event in the form of {@link streamDeck.onWillDisappear}. In this example,
     * we're setting the title to the "count" that is incremented in {@link BeeminderMonitor.onKeyDown}.
     */
    private intervals: Map<string, NodeJS.Timeout> = new Map<string, NodeJS.Timeout>();

    onWillAppear(ev: WillAppearEvent<GoalSettings>): void | Promise<void> {
        // Call updateButton every 60 seconds:
        if (!this.intervals.has(ev.action.id)) {
            this.intervals.set(ev.action.id, setInterval(() => {
                this.logger.debug("Timer fired")
                ev.action.getSettings()
            }, 60000));
        }
        if (ev.payload.settings.slug) {
            return ev.action.getSettings();
        }
    }

    onWillDisappear(ev: WillDisappearEvent<GoalSettings>): Promise<void> | void {
        if (this.intervals.has(ev.action.id)) {
            clearInterval(this.intervals.get(ev.action.id) as NodeJS.Timeout);
            this.intervals.delete(ev.action.id);
        }
    }

    /**
     * Listens for the {@link SingletonAction.onKeyDown} event which is emitted by Stream Deck when an action is pressed. Stream Deck provides various events for tracking interaction
     * with devices including key down/up, dial rotations, and device connectivity, etc. When triggered, {@link ev} object contains information about the event including any payloads
     * and action information where applicable. In this example, our action will display a counter that increments by one each press. We track the current count on the action's persisted
     * settings using `setSettings` and `getSettings`.
     */
    async onKeyDown(ev: KeyDownEvent<GoalSettings>): Promise<void> {
        return ev.action.getSettings();
    }

    async updateButton(settings: GoalSettings, action: Action<GoalSettings>): Promise<void> {
        const globalSettings = await streamDeck.settings.getGlobalSettings() as BeeminderSettings;
        const goalData = await this.getGoalData(globalSettings.apiToken, settings.slug);
        let svg = this.getButtonSvg(goalData, settings.progressBarCutoff || 99);
        return action.setImage("data:image/svg+xml;charset=utf8," + svg);
    }


    getButtonSvg(goalData: GoalData, progressBarCutoff: number): string {
        const getFontSize = (text: string, maxWidth: number, maxFontSize: number) =>
            Math.min(maxWidth / (text.length * 0.45), maxFontSize);

        const limsumLines = goalData.limsum.split(' ');
        const limsumLine1 = limsumLines[0];
        const limsumLine2 = limsumLines.slice(1).join(' ');

        return `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
    <rect width="144" height="144" fill="${goalData.roadstatuscolor}" />
    <text x="72" y="40" dominant-baseline="middle" text-anchor="middle" fill="#000" font-size="${getFontSize(limsumLine1, 140, 30)}px" font-family="Tahoma">${limsumLine1}</text>
    <text x="72" y="82" dominant-baseline="middle" text-anchor="middle" fill="#000" font-size="${getFontSize(limsumLine2, 140, 40)}px" font-family="Tahoma">${limsumLine2}</text>` +
            this.getProgressBar(goalData, progressBarCutoff) +
            `<text x="72" y="135" dominant-baseline="middle" text-anchor="middle" fill="#000" font-size="${getFontSize(goalData.slug, 140, 28)}px" font-family="Tahoma">${goalData.slug}</text>
    </svg>`;
    }

    getProgressBar(goalData: GoalData, progressBarCutoff: number): string {
        const barWidth = 120;
        const barOffset = (144 - barWidth) / 2;
        const progressWidth = this.getProgressWidth(goalData, barWidth);
        const shouldIncludeBar = progressBarCutoff > goalData.safebuf;
        this.logger.debug(`shouldIncludeBar: ${shouldIncludeBar}`)
        this.logger.debug(`progressBarCutoff: ${progressBarCutoff}, safebuf: ${goalData.safebuf}`)
        return shouldIncludeBar
            ? `<rect x="${barOffset}" y="100" width="${barWidth}" height="10" fill="lightgrey" />
   <rect x="${barOffset}" y="100" width="${progressWidth}" height="10" fill="${goalData.roadstatuscolor}" />`
            : '';
    }


    private getProgressWidth(goalData: GoalData, barWidth: number = 134) {
        const today = new Date(goalData.curday * 1000)
        let todayStamp = today.toISOString().slice(0, 10).replace(/-/g, '');
        const todayData = goalData.recent_data.filter((dataPoint) => dataPoint.daystamp === todayStamp);
        // sum up todayData values
        const totalToday = todayData.reduce((a, b) => a + b.value, 0);
        // period is the last word of graphsum
        const periodInDays = this.getDaysInPeriod(goalData.graphsum.split(' ').pop());
        const todayGoal = Math.ceil(goalData.currate / periodInDays);
        const progressPercent = totalToday / todayGoal;
        return Math.round(barWidth * progressPercent);
    }

    async getGoalData(apiToken: string, goalSlug: string): Promise<GoalData> {
        let url = `https://www.beeminder.com/api/v1/users/me/goals/${goalSlug}.json?auth_token=${apiToken}`;
        this.logger.debug(`Fetching goal data from ${url}`)
        const response = await fetch(url);
        if (!response.ok) {
            this.logger.error(`Error fetching goal data: ${response.statusText}`)
            throw new Error(`Error fetching goal data: ${response.statusText}`);
        }
        this.logger.debug(`Got response: ${JSON.stringify(response)}`)
        return await response.json() as GoalData;
    }

    onDidReceiveSettings(ev: DidReceiveSettingsEvent<GoalSettings>): Promise<void> | void {
        return this.updateButton(ev.payload.settings, ev.action)
    }

    private getDaysInPeriod(pop: string | undefined): number {
        switch (pop) {
            case 'day':
                return 1;
            case 'week':
                return 7;
            case 'month':
                return 30;
            case 'year':
                return 365;
            default:
                return 1;
        }
    }
}

/**
 * Settings for {@link BeeminderMonitor}.
 */
type GoalSettings = {
    slug: string;
    progressBarCutoff: number | null;
};
