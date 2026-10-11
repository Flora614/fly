// Fixed display baseline selected by the user from the 2026-10-10 screenshots.
// These are references to existing observations, never new fare observations.
export const displayBaseline = {
    "label": "2026年10月10日截图基准（23:19–23:21）",
    "sourceKind": "automatic",
    "sourceName": "厦航官网",
    "taxBasis": "unknown",
    "priceScope": "official_display_per_adult",
    "quotes": [
        {
            "date": "2026-10-10",
            "lowest": 2100,
            "zPrice": null,
            "queriedAt": "2026-10-10T07:20:53.336Z",
            "recordId": "faf419bf-7e11-4cc0-b447-f115b0e3b808"
        },
        {
            "date": "2026-10-11",
            "lowest": 880,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:19:57.330Z",
            "recordId": "9c98eb6c-d37f-42cf-aa88-acdbda8f6d62"
        },
        {
            "date": "2026-10-12",
            "lowest": 800,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:20:08.245Z",
            "recordId": "75450132-7ff3-41c3-854f-a6b5018fd4a1"
        },
        {
            "date": "2026-10-13",
            "lowest": 850,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:20:21.183Z",
            "recordId": "1c84c73c-70a5-4bbe-8e30-0f966681136c"
        },
        {
            "date": "2026-10-14",
            "lowest": 454,
            "zPrice": 454,
            "queriedAt": "2026-10-10T15:20:32.079Z",
            "recordId": "ccb20f89-dfeb-4ebe-bb80-8d6fd8b20557"
        },
        {
            "date": "2026-10-15",
            "lowest": 549,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:20:44.864Z",
            "recordId": "d62e17f6-efe5-4790-8eb5-7c1e804d023c"
        },
        {
            "date": "2026-10-16",
            "lowest": 650,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:20:57.827Z",
            "recordId": "8909f3e3-d6c1-4665-9ba0-f360a9a28ae0"
        },
        {
            "date": "2026-10-17",
            "lowest": 600,
            "zPrice": 600,
            "queriedAt": "2026-10-10T15:21:11.752Z",
            "recordId": "e1a53561-1ab5-4e99-81a4-2bf0bcd3dd96"
        },
        {
            "date": "2026-10-18",
            "lowest": 650,
            "zPrice": null,
            "queriedAt": "2026-10-10T15:21:24.194Z",
            "recordId": "cb997b02-e838-4b14-8c01-296dc6d87d14"
        },
        {
            "date": "2026-10-19",
            "lowest": 550,
            "zPrice": 550,
            "queriedAt": "2026-10-10T15:21:38.804Z",
            "recordId": "f46dd804-5ea1-4f48-982c-51e86c6fe82c"
        },
        {
            "date": "2026-10-20",
            "lowest": 600,
            "zPrice": 600,
            "queriedAt": "2026-10-10T15:19:40.375Z",
            "recordId": "9f750dd1-ce5d-45d3-913e-d359c9834c78"
        },
        {
            "date": "2026-10-21",
            "lowest": 550,
            "zPrice": 550,
            "queriedAt": "2026-10-10T15:21:51.759Z",
            "recordId": "f2d3e776-0d74-4013-816d-8afd734c86d8"
        }
    ]
};
// Display-only comparison. Collection and notification changes keep their own rules.
export function differenceFromBaseline(record, metric) {
    const base = displayBaseline.quotes.find(q => q.date === record?.date);
    if (!record || !base || record.status !== 'success' ||
        record.source.kind !== displayBaseline.sourceKind || record.source.name !== displayBaseline.sourceName ||
        record.taxBasis !== displayBaseline.taxBasis || record.priceScope !== displayBaseline.priceScope ||
        !Number.isFinite(Date.parse(record.queriedAt)) || Date.parse(record.queriedAt) < Date.parse(base.queriedAt))
        return null;
    const current = record[metric], initial = base[metric];
    return typeof current === 'number' && Number.isFinite(current) && typeof initial === 'number' ? current - initial : null;
}

for (const quote of displayBaseline.quotes) Object.freeze(quote);
Object.freeze(displayBaseline.quotes);
Object.freeze(displayBaseline);
