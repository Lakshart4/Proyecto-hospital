export interface ReportSummary {
  generatedAt: string;
  from: string;
  to: string;
  activity: {
    admissions: number;
    discharges: number;
    deaths: number;
    treatmentsPerformed: number;
    surgeriesScheduled: number;
    inventoryEntries: number;
    inventoryExits: number;
    inventoryAdjustments: number;
    deliveriesReceived: number;
  };
  patients: { active: number; discharged: number; deceased: number };
  occupancy: {
    departmentId: number;
    department: string;
    rooms: number;
    occupiedRooms: number;
    activeAssignments: number;
    capacity: number;
  }[];
}
