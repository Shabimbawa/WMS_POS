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
                <div className="print-party"><span className="print-party-label">{t("Supplier")}:</span><strong>{shipment.supplier.name}</strong><span><b>{t("Code")}:</b> {shipment.supplier.code || dash}</span><span><b>{t("Origin")}:</b> {shipment.supplier.origin || dash}</span><span><b>{t("Type")}:</b> {t(shipment.supplier.kind === "INTERNATIONAL" ? "International" : "National")}</span></div>
                <div className="print-brand"><h1 className="print-company">{COMPANY_NAME}</h1><div className="print-doc-title">{t("Packing List")}</div></div>
                <div className="print-reference"><span><b>{t("Document no.")}</b> {shipment.id.slice(0, 8).toUpperCase()}</span><span><b>{t("Date")}</b> {DateParser(shipment.date_list_received)}</span></div>
              </header>

              <table className="print-table print-consolidated-table">
                <thead><tr><th>{t("Container")}</th><th>{t("Product")}</th><th className="num">{t("Sacks")}</th><th className="num">{t("Price / sack")}</th><th className="num">{t("Amount")}</th></tr></thead>
                <tbody>{containers.flatMap((container, containerIndex) => container.container_item.map((item, itemIndex) => <tr key={item.id} className={itemIndex === 0 ? "print-container-start" : undefined}>
                  <td>{itemIndex === 0 ? <><strong className="print-container-no">{container.container_no ?? t("No box")}</strong><small>{t("Container")} {containerIndex + 1}</small></> : null}</td>
                  <td>{fmtProduct(item.product_category)}</td>
                  <td className="num">{fmtInt(item.qty_sacks)}</td>
                  <td className="num">{item.price_per_sack !== null ? fmtPhp(item.price_per_sack) : dash}</td>
                  <td className="num">{item.price_per_sack !== null ? fmtPhp(item.price_per_sack * item.qty_sacks) : dash}</td>
                </tr>))}</tbody>
                <tfoot><tr><td>{fmtInt(containers.length)} {t("containers")}</td><td><strong>{t("Grand total")}</strong></td><td className="num">{fmtInt(totalSacks)}</td><td /><td className="num">{hasAnyPrice ? fmtPhp(totalAmount) : dash}</td></tr></tfoot>
              </table>

              <div className="print-logistics">
                {containers.map((container) => <div key={container.id}><strong className="print-container-no">{container.container_no ?? t("No box")}</strong><span>{container.shipping_company?.name ?? dash}</span><span>{container.is_company_truck ? t("Own truck") : container.hauler || dash}</span><span>{container.date_arrived_at_port ? DateParser(container.date_arrived_at_port) : dash}</span><span>{container.date_delivered ? DateParser(container.date_delivered) : dash}</span></div>)}
                <div className="print-logistics-head"><b>{t("Container")}</b><b>{t("Shipping line")}</b><b>{t("Hauling")}</b><b>{t("At port")}</b><b>{t("Delivered")}</b></div>
              </div>

              <div className="print-legacy-containers">
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
                      <strong>{t("Container")} {index + 1}</strong>
                      <span className="print-container-no">
                        {container.container_no ?? t("No box")}
                      </span>
                      {container.shipping_company ? (
                        <span>
                          {container.shipping_company.code
                            ? `${container.shipping_company.name} (${container.shipping_company.code})`
                            : container.shipping_company.name}
                        </span>
                      ) : null}
                      {container.is_company_truck ? (
                        <span className="print-truck-tag">{t("Own truck")}</span>
                      ) : container.hauler ? (
                        <span className="print-truck-tag">{container.hauler}</span>
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
                    <div className="print-shipping-details">
                      <span><b>{t("Shipping line")}</b>{container.shipping_company ? container.shipping_company.name : dash}</span>
                      <span><b>{t("Hauling")}</b>{container.is_company_truck ? t("Own truck") : container.hauler || dash}</span>
                      <span><b>{t("At port")}</b>{container.date_arrived_at_port ? DateParser(container.date_arrived_at_port) : dash}</span>
                      <span><b>{t("Delivered")}</b>{container.date_delivered ? DateParser(container.date_delivered) : dash}</span>
                    </div>
                  </section>
                );
              })}
              </div>

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

              {containers.some((container) => container.notes) && <div className="print-notes">
                <b>{t("Notes")}:</b>
                {containers.filter((container) => container.notes).map((container) => <div key={container.id}><strong className="print-container-no">{container.container_no ?? t("No box")}</strong> — {container.notes}</div>)}
              </div>}
              <div className="print-footer"><span>{t("This is a system-generated document. No signature is required.")}</span><span>{t("Generated")}: {dayjs().format("MMMM D, YYYY h:mm A")}</span></div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
