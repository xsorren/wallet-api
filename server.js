require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const { Template, Pass } = require('@walletpass/pass-js');
const express = require('express');
const app = express();

app.use(express.json());

// Configurar AWS SDK
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

async function prepareTemplate() {
    try {
        // Cargar el archivo de plantilla del pass desde S3
        const passTemplateParams = {
            Bucket: "test-wallet-ios",
            Key: "models/custom.pass.zip"
        };
        const passTemplateData = await s3.getObject(passTemplateParams).promise();
        const template = await Template.fromBuffer(passTemplateData.Body);

        // Cargar el archivo del certificado desde S3
        const certParams = {
            Bucket: "test-wallet-ios",
            Key: "keys/Certificados.pem"
        };
        const certData = await s3.getObject(certParams).promise();
        const certificateString = certData.Body.toString('utf8');

        // Escribir el certificado a un archivo temporal (esto se hace para manejar correctamente la carga sin problemas de formatos)
        const certPath = './certificate.pem';
        fs.writeFileSync(certPath, certificateString);

        // Cargar el certificado y la clave privada en la plantilla del pass
        await template.loadCertificate(certPath, "");  // No password for the private key

        // Borrar el archivo temporal del certificado
        fs.unlinkSync(certPath);

        return template;
    } catch (error) {
        console.error("Failed to prepare template:", error);
        throw error;
    }
}

app.post('/create-pass', async (req, res) => {
    try {
        const template = await prepareTemplate();
        const pass = template.createPass({
            serialNumber: req.body.serialNumber || "123456789",
            organizationName: req.body.organizationName || "Your Organization",
            description: req.body.description || "A sample pass",
            logoText: req.body.logoText || "Your Logo Text",
            foregroundColor: req.body.foregroundColor || "rgb(255, 255, 255)",
            backgroundColor: req.body.backgroundColor || "rgb(107, 156, 196)",
            labelColor: req.body.labelColor || "rgb(255, 255, 255)"
        });
        if (!(pass instanceof Pass)) {
            throw new Error("Failed to create pass: Pass object is not valid.");
        }
        pass.barcode = {
            format: req.body.barcodeFormat || "PKBarcodeFormatQR",
            message: req.body.barcodeMessage || "Example Message",
            messageEncoding: "iso-8859-1"
        };

        if (req.body.primaryFields) {
            req.body.primaryFields.forEach(field => pass.primaryFields.add(field));
        }

        const passBuffer = await pass.asBuffer();
        const passFilePath = `saved_passes_ios/generated-${Date.now()}.pkpass`;

        const uploadParams = {
            Bucket: "test-wallet-ios",
            Key: passFilePath,
            Body: passBuffer
        };
        await s3.upload(uploadParams).promise();

        res.status(200).send({ success: true, message: "Pass created successfully.", url: `https://${uploadParams.Bucket}.s3.amazonaws.com/${passFilePath}` });
    } catch (error) {
        console.error("Failed to create pass:", error);
        res.status(500).send({ success: false, message: "Failed to create pass." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
