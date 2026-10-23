type App = {
    registerPlugin: (descriptor: {
        id: string;
        name: string;
    }) => void;
};
declare const _default: {
    register(app: App): void;
    bootstrap(_app: App): Promise<void>;
    registerTrads: ({ locales }: {
        locales: string[];
    }) => Promise<{
        data: Record<string, string>;
        locale: string;
    }[]>;
};
export default _default;
