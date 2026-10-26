/** Add the same dated price schedule to both the viewer and downloadable GLB. */
export function attachFurnitureBudget(model, budget) {
  const itemMap = new Map(budget.items.map(item => [item.id, item]));
  const plannedAMD = budget.items.reduce((sum, item) => sum + item.qty * item.unitAMD, 0);
  const retailAMD = budget.items.filter(item => item.kind === 'retail').reduce((sum, item) => sum + item.qty * item.unitAMD, 0);
  const capAMD = budget.budgetUSD * budget.usdToAmd;
  const summary = {
    asOf: budget.asOf, currency: 'AMD', referenceUSDToAMD: budget.usdToAmd,
    budgetUSD: budget.budgetUSD, plannedAMD, retailAMD,
    planningAllowancesAMD: plannedAMD - retailAMD,
    reserveAMD: budget.reserveAMD, unallocatedAMD: capAMD - plannedAMD - budget.reserveAMD,
    scope: budget.scope,
    note: 'A planning schedule, not a supplier quotation. Forms are schematic; listed dimensions and custom estimates are distinguished in the schedule.'
  };
  model.userData.furnitureBudget = summary;
  model.traverse(object => {
    const item = itemMap.get(object.userData.budgetItemId);
    if (!item) return;
    const source = budget.sources.find(source => source.id === item.sourceId);
    object.userData.furniturePrice = {
      itemId: item.id, name: item.name, kind: item.kind, unitAMD: item.unitAMD,
      scheduleQuantity: item.qty, currency: 'AMD', asOf: budget.asOf,
      dimensions: item.dimensions, supplier: item.supplier,
      ...(source ? { source: source.url } : {})
    };
  });
  return summary;
}
