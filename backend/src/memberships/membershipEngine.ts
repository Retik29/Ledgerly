export interface MembershipPeriod {
  joinedAt: Date;
  leftAt: Date | null;
}

export class MembershipEngine {
  /**
   * Main expense inclusion rule:
   * A member participates only if joinedAt <= expenseDate AND (leftAt IS NULL OR expenseDate <= leftAt)
   */
  static isMemberActiveOnDate(
    periods: MembershipPeriod[],
    expenseDate: Date
  ): boolean {
    if (periods.length === 0) return false;

    // Reset date hours to compare purely by calendar date UTC
    const targetTime = this.getStartOfDayTime(expenseDate);

    return periods.some(period => {
      const joinedTime = this.getStartOfDayTime(period.joinedAt);
      const leftTime = period.leftAt ? this.getStartOfDayTime(period.leftAt) : null;

      return targetTime >= joinedTime && (leftTime === null || targetTime <= leftTime);
    });
  }

  private static getStartOfDayTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
}
