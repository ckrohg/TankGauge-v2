import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Delivery {
  date: string;
  amount: number;
  pricePerGallon: number;
  totalCost: number;
}

interface DeliveryHistoryTableProps {
  deliveries: Delivery[];
}

export default function DeliveryHistoryTable({ deliveries }: DeliveryHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount (gal)</TableHead>
              <TableHead className="text-right">Price/gal</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery, index) => (
              <TableRow key={index} data-testid={`row-delivery-${index}`}>
                <TableCell className="font-medium">{delivery.date}</TableCell>
                <TableCell className="text-right font-mono">{delivery.amount.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono">${delivery.pricePerGallon.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  ${delivery.totalCost.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
