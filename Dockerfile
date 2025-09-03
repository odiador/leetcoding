# Stage 1: The Build Stage
FROM node:22.14 AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker's caching
# This step is crucial for fast rebuilds
COPY package*.json ./

# Install all dependencies, including devDependencies for the build step
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code into JavaScript
RUN npm run build

# Stage 2: The Production Stage (Lean and Light)
FROM node:22.14-alpine

# Set the working directory
WORKDIR /app

# Copy only the compiled application code and a few key files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Only install production dependencies
RUN npm install --production

# Expose the port your Hono application runs on
# Exponer puerto (coincide con tu env o default 3010)
ARG PORT=3010
ENV PORT=${PORT}
EXPOSE ${PORT}

# Set the entry point to start the application
CMD ["npm", "run", "start"]