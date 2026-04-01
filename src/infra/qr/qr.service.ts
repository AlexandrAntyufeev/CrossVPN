import QRCode from "qrcode";

export class QrService {
  async toDataUrl(value: string): Promise<string> {
    return QRCode.toDataURL(value);
  }

  async toBuffer(value: string): Promise<Buffer> {
    return QRCode.toBuffer(value, {
      type: "png",
      margin: 1,
      width: 512,
    });
  }
}
