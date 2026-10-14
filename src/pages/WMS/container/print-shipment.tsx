import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import type { ShipmentRow } from "../../../queries/types";
import { fmtInt, fmtProduct } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";
import { useLanguage } from "../../../common/context/language-context";

const COMPANY_NAME = "Wensor Trading";

const phpAmount = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Currency shown as "PHP 600.00" rather than the peso symbol. */
const fmtPhp = (v: number | null | undefined) =>
  v === null || v === undefined ? "-" : `PHP ${phpAmount.format(v)}`;

/** Placeholder for a value that is absent, without relying on em dashes. */
const dash = "-";

/**
 * A Print button for one packing-list row. Opens a full-screen overlay with
 * the shipment's contents laid out as a document, and a Print button that
 * hands the document to the browser's print dialog. Only this document is
 * printed: the print stylesheet hides everything else.
 */
export function ShipmentPrintButton({ shipment }: { shipment: ShipmentRow }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const containers = shipment.container;

  const totalSacks = containers.reduce(
    (n, c) => n + c.container_item.reduce((m, i) => m + i.qty_sacks, 0),
    0,
  );

  const totalAmount = containers.reduce(
    (n, c) =>
      n +
      c.container_item.reduce(
        (m, i) =>
          m + (i.price_per_sack !== null ? i.price_per_sack * i.qty_sacks : 0),
        0,
      ),
    0,
  );

  const hasAnyPrice = containers.some((c) =>
    c.container_item.some((i) => i.price_per_sack !== null),
  );

  return (
    <>
      <Button
        type="text"
        size="small"
        icon={<PrinterOutlined />}
        title={t("Print packing list")}
        onClick={() => setOpen(true)}
      />

      {open &&
        createPortal(
          <div className="print-overlay">
            <div className="print-toolbar">
              <Button onClick={() => setOpen(false)}>{t("Close")}</Button>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={() => window.print()}
              >
                {t("Print")}
              </Button>
            </div>

            <div className="print-doc">
              <header className="print-letterhead">
                <h1 className="print-company">{COMPANY_NAME}</h1>
                <div className="print-doc-title">{t("Packing List")}</div>
              </header>

              <div className="print-details">
                <div className="print-detail">
                  <span className="print-label">{t("Supplier")}:</span>
                  <span>
                    {shipment.supplier.name}
                    {shipment.supplier.code
                      ? ` (${shipment.supplier.code})`
                      : ""}
                  </span>
                </div>
                <div className="print-detail">
                  <span className="print-label">{t("List received")}:</span>
                  <span>{DateParser(shipment.date_list_received)}</span>
                </div>
                {shipment.reference ? (
                  <div className="print-detail">
                    <span className="print-label">{t("Reference")}:</span>
                    <span>{shipment.reference}</span>
                  </div>
                ) : null}
              </div>

              {containers.map((container, index) => {
                const containerSacks = container.container_item.reduce(
                  (n, i) => n + i.qty_sacks,
                  0,
                );
                const containerAmount = container.container_item.reduce(
                  (n, i) =>
                    n +
                    (i.price_per_sack !== null
                      ? i.price_per_sack * i.qty_sacks
                      : 0),
                  0,
                );
                const containerHasPrice = container.container_item.some(
                  (i) => i.price_per_sack !== null,
                );

                return (
                  <section className="print-container" key={container.id}>
                    <div className="print-container-head">
                      <strong>
                        {t("Container")} #{index + 1}
                      </strong>
                      <span className="print-container-no">
                        {container.container_no ?? t("No box")}
                      </span>
                      {container.is_company_truck ? (
                        <span className="print-truck-tag">{t("Own truck")}</span>
                      ) : null}
                    </div>

                    <table className="print-table">
                      <thead>
                        <tr>
                          <th>{t("Product")}</th>
                          <th className="num">{t("Sacks")}</th>
                          <th className="num">{t("Price / sack")}</th>
                          <th className="num">{t("Amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {container.container_item.map((item) => (
                          <tr key={item.id}>
                            <td>{fmtProduct(item.product_category)}</td>
                            <td className="num">{fmtInt(item.qty_sacks)}</td>
                            <td className="num">
                              {item.price_per_sack !== null
                                ? fmtPhp(item.price_per_sack)
                                : dash}
                            </td>
                            <td className="num">
                              {item.price_per_sack !== null
                                ? fmtPhp(item.price_per_sack * item.qty_sacks)
                                : dash}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>{t("Total")}</td>
                          <td className="num">{fmtInt(containerSacks)}</td>
                          <td className="num" />
                          <td className="num">
                            {containerHasPrice ? fmtPhp(containerAmount) : dash}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </section>
                );
              })}

              <footer className="print-totals">
                <span>
                  {t("Containers")}: {fmtInt(containers.length)}
                </span>
                <span>
                  {t("Total Sacks")}: {fmtInt(totalSacks)}
                </span>
                {hasAnyPrice ? (
                  <span>
                    {t("Total Amount")}: {fmtPhp(totalAmount)}
                  </span>
                ) : null}
              </footer>

              <div className="print-footer">
                {t("Printed")}: {dayjs().format("MMMM D, YYYY")}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
