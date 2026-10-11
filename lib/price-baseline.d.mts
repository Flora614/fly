type BaselineQuote={date:string;queriedAt:string;status:string;lowest:number|null;zPrice:number|null;taxBasis:string;priceScope:string;source:{kind:string;name:string}};
type BaselineRow={date:string;lowest:number;zPrice:number|null;queriedAt:string;recordId:string};
export const displayBaseline:Readonly<{label:string;sourceKind:string;sourceName:string;taxBasis:string;priceScope:string;quotes:readonly Readonly<BaselineRow>[]} >;
export function differenceFromBaseline(record:BaselineQuote|undefined,metric:'lowest'|'zPrice'):number|null;
